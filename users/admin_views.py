"""Admin-only moderation views for user management."""

from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.models import Transaction

from .admin_serializers import AdminUserListSerializer, ModerationActionSerializer
from .permissions import IsAdminUser

User = get_user_model()


def _overdue_borrower_ids():
    """Return a set of user IDs who have at least one overdue loan."""
    return set(
        Transaction.objects.filter(
            transaction_type=Transaction.Type.LOAN,
            loan_end__lt=date.today(),
        )
        .exclude(status__in=[Transaction.Status.DONE, Transaction.Status.CANCELLED])
        .values_list("borrower_id", flat=True)
    )


class AdminUserListView(APIView):
    """List all users with optional status filtering.

    Query params:
        status: active | suspended | blacklisted | overdue
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        filter_status = request.query_params.get("status", "").lower()
        queryset = User.objects.all().order_by("-date_joined")

        if filter_status == "active":
            queryset = queryset.filter(is_suspended=False, is_blacklisted=False)
        elif filter_status == "suspended":
            queryset = queryset.filter(is_suspended=True)
        elif filter_status == "blacklisted":
            queryset = queryset.filter(is_blacklisted=True)
        elif filter_status == "overdue":
            ids = _overdue_borrower_ids()
            queryset = queryset.filter(id__in=ids)

        serializer = AdminUserListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminStatsView(APIView):
    """Dashboard statistics and chart data for the admin panel."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        total = User.objects.count()
        suspended = User.objects.filter(is_suspended=True).count()
        blacklisted = User.objects.filter(is_blacklisted=True).count()
        overdue_ids = _overdue_borrower_ids()
        overdue = len(overdue_ids)
        active = total - suspended - blacklisted

        # Ensure active never goes negative due to overlap
        if active < 0:
            active = 0

        data = {
            "total_users": total,
            "active_users": active,
            "suspended_users": suspended,
            "blacklisted_users": blacklisted,
            "overdue_users": overdue,
            "chart_status": [
                {"label": "Active", "value": active},
                {"label": "Suspended", "value": suspended},
                {"label": "Blacklisted", "value": blacklisted},
            ],
            "chart_overdue": [
                {"label": "Overdue", "value": overdue},
                {"label": "On Time", "value": total - overdue},
            ],
        }
        return Response(data, status=status.HTTP_200_OK)


class AdminSuspendUserView(APIView):
    """Suspend a specific user."""

    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_staff:
            return Response(
                {"detail": "Cannot suspend an admin user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ModerationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.is_suspended = True
        user.suspension_reason = serializer.validated_data["reason"]
        user.suspended_at = timezone.now()
        user.save(update_fields=["is_suspended", "suspension_reason", "suspended_at"])

        return Response(
            {"detail": f"User {user.email} has been suspended."},
            status=status.HTTP_200_OK,
        )


class AdminBlacklistUserView(APIView):
    """Blacklist a specific user."""

    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_staff:
            return Response(
                {"detail": "Cannot blacklist an admin user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ModerationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.is_blacklisted = True
        user.blacklist_reason = serializer.validated_data["reason"]
        user.blacklisted_at = timezone.now()
        # Also deactivate suspension if present to keep state clean
        user.is_suspended = False
        user.suspension_reason = None
        user.suspended_at = None
        user.save(update_fields=[
            "is_blacklisted", "blacklist_reason", "blacklisted_at",
            "is_suspended", "suspension_reason", "suspended_at",
        ])

        return Response(
            {"detail": f"User {user.email} has been blacklisted."},
            status=status.HTTP_200_OK,
        )


class AdminReactivateUserView(APIView):
    """Reactivate a suspended or blacklisted user."""

    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user.is_suspended = False
        user.suspension_reason = None
        user.suspended_at = None
        user.is_blacklisted = False
        user.blacklist_reason = None
        user.blacklisted_at = None
        user.save(update_fields=[
            "is_suspended", "suspension_reason", "suspended_at",
            "is_blacklisted", "blacklist_reason", "blacklisted_at",
        ])

        return Response(
            {"detail": f"User {user.email} has been reactivated."},
            status=status.HTTP_200_OK,
        )
