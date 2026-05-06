"""Admin-only moderation views for user management."""

from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError, RestrictedError
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.models import ContactMessage, Listing, Transaction, refresh_overdue_transactions

from .admin_serializers import (
    AdminModerationActionSerializer,
    AdminUserListSerializer,
    ModerationActionSerializer,
)
from .permissions import IsAdminUser

User = get_user_model()


def _day_bounds(day):
    """Return timezone-aware datetime bounds for one calendar day."""
    current_tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), current_tz)
    return start, start + timedelta(days=1)


def _count_between(queryset, field, start, end):
    """Count queryset rows where a datetime field falls inside a range."""
    return queryset.filter(**{f"{field}__gte": start, f"{field}__lt": end}).count()


def _daily_series(queryset, field, days=14):
    """Build a daily count series using real database rows."""
    today = timezone.localdate()
    start_day = today - timedelta(days=days - 1)
    series = []

    for offset in range(days):
        day = start_day + timedelta(days=offset)
        start, end = _day_bounds(day)
        series.append(
            {
                "label": day.strftime("%b %d"),
                "date": day.isoformat(),
                "value": _count_between(queryset, field, start, end),
            }
        )

    return series


def _weekly_series(queryset, field, weeks=8):
    """Build a weekly count series using real database rows."""
    today = timezone.localdate()
    start_week = today - timedelta(days=today.weekday() + (weeks - 1) * 7)
    series = []

    for offset in range(weeks):
        week_start = start_week + timedelta(days=offset * 7)
        week_end = week_start + timedelta(days=7)
        start, _ = _day_bounds(week_start)
        end, _ = _day_bounds(week_end)
        series.append(
            {
                "label": week_start.strftime("%b %d"),
                "date": week_start.isoformat(),
                "value": _count_between(queryset, field, start, end),
            }
        )

    return series


def _cumulative_daily_users(days=14):
    """Build a cumulative total-user series from actual user creation dates."""
    today = timezone.localdate()
    start_day = today - timedelta(days=days - 1)
    series = []

    for offset in range(days):
        day = start_day + timedelta(days=offset)
        _, end = _day_bounds(day)
        series.append(
            {
                "label": day.strftime("%b %d"),
                "date": day.isoformat(),
                "value": User.objects.filter(date_joined__lt=end).count(),
            }
        )

    return series


def _value_counts(queryset, field, label_field=None, empty_label="Unknown"):
    """Build label/value counts for a model field."""
    values = queryset.values(field).annotate(value=Count("id")).order_by("-value", field)
    data = []

    for row in values:
        label = row[field]
        if label_field and label:
            label = row.get(label_field, label)
        data.append({"label": label or empty_label, "value": row["value"]})

    return data


def _overdue_borrower_ids():
    """Return a set of user IDs who have at least one overdue loan."""
    refresh_overdue_transactions()
    return set(
        Transaction.objects.filter(
            transaction_type=Transaction.Type.LOAN,
            expected_return_date__lt=date.today(),
            actual_return_date__isnull=True,
            status=Transaction.Status.OVERDUE,
        )
        .values_list("requester_id", flat=True)
    )


class AdminUserListView(APIView):
    """List all users with optional status filtering.

    Query params:
        status: active | suspended | blacklisted | overdue
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        refresh_overdue_transactions()
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
        verified = User.objects.filter(is_verified=True).count()
        unverified = total - verified
        total_listings = Listing.objects.count()
        total_messages = ContactMessage.objects.count()
        total_transactions = Transaction.objects.count()
        active_loans = Transaction.objects.filter(status=Transaction.Status.ACTIVE_LOAN).count()
        overdue_transactions = Transaction.objects.filter(status=Transaction.Status.OVERDUE).count()
        completed_transactions = Transaction.objects.filter(
            status__in=[
                Transaction.Status.COMPLETED,
                Transaction.Status.SOLD,
                Transaction.Status.RETURNED,
            ]
        ).count()
        meetings_scheduled = Transaction.objects.filter(status=Transaction.Status.MEETING_SCHEDULED).count()
        overdue_ids = _overdue_borrower_ids()
        overdue = len(overdue_ids)
        active = total - suspended - blacklisted

        # Ensure active never goes negative due to overlap
        if active < 0:
            active = 0

        listing_status = [
            {
                "label": label,
                "value": Listing.objects.filter(status=value).count(),
            }
            for value, label in Listing.Status.choices
        ]

        data = {
            "total_users": total,
            "active_users": active,
            "suspended_users": suspended,
            "blacklisted_users": blacklisted,
            "verified_users": verified,
            "unverified_users": unverified,
            "overdue_users": overdue,
            "total_listings": total_listings,
            "total_messages": total_messages,
            "total_transactions": total_transactions,
            "active_loans": active_loans,
            "overdue_transactions": overdue_transactions,
            "completed_transactions": completed_transactions,
            "meetings_scheduled": meetings_scheduled,
            "chart_status": [
                {"label": "Active", "value": active},
                {"label": "Suspended", "value": suspended},
                {"label": "Blacklisted", "value": blacklisted},
            ],
            "chart_verification": [
                {"label": "Verified", "value": verified},
                {"label": "Unverified", "value": unverified},
            ],
            "chart_overdue": [
                {"label": "Overdue", "value": overdue},
                {"label": "On Time", "value": total - overdue},
            ],
            "chart_total_users_over_time": _cumulative_daily_users(days=14),
            "chart_new_users_by_day": _daily_series(User.objects.all(), "date_joined", days=14),
            "chart_new_users_by_week": _weekly_series(User.objects.all(), "date_joined", weeks=8),
            "chart_users_by_filiere": _value_counts(User.objects.all(), "filiere"),
            "chart_listings_by_category": _value_counts(Listing.objects.select_related("category"), "category__name"),
            "chart_listings_by_status": listing_status,
            "chart_contact_messages_over_time": _daily_series(ContactMessage.objects.all(), "created_at", days=14),
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
        user.suspension_until = None
        user.can_contact = False
        user.save(update_fields=["is_suspended", "suspension_reason", "suspended_at", "suspension_until", "can_contact"])

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
        user.suspension_until = None
        user.save(update_fields=[
            "is_blacklisted", "blacklist_reason", "blacklisted_at",
            "is_suspended", "suspension_reason", "suspended_at", "suspension_until",
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
        user.suspension_until = None
        user.is_blacklisted = False
        user.blacklist_reason = None
        user.blacklisted_at = None
        user.can_contact = True
        user.save(update_fields=[
            "is_suspended", "suspension_reason", "suspended_at", "suspension_until",
            "is_blacklisted", "blacklist_reason", "blacklisted_at",
            "can_contact",
        ])

        return Response(
            {"detail": f"User {user.email} has been reactivated."},
            status=status.HTTP_200_OK,
        )


class AdminUserModerationActionView(APIView):
    """Apply one basic moderation action to a non-admin user."""

    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        """Persist a suspend, blacklist, contact, or active-status change."""
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminModerationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data["action"]
        reason = serializer.validated_data.get("reason") or "Updated by admin."
        suspension_until = serializer.validated_data.get("suspension_until")

        if user.is_staff or user.is_superuser:
            return Response(
                {"detail": "Cannot moderate an admin user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = []

        if action == "suspend":
            user.is_suspended = True
            user.suspension_reason = reason
            user.suspended_at = timezone.now()
            user.suspension_until = suspension_until
            user.can_contact = False
            update_fields = ["is_suspended", "suspension_reason", "suspended_at", "suspension_until", "can_contact"]
        elif action == "unsuspend":
            user.is_suspended = False
            user.suspension_reason = None
            user.suspended_at = None
            user.suspension_until = None
            user.can_contact = True
            update_fields = ["is_suspended", "suspension_reason", "suspended_at", "suspension_until", "can_contact"]
        elif action == "blacklist":
            user.is_blacklisted = True
            user.blacklist_reason = reason
            user.blacklisted_at = timezone.now()
            user.is_suspended = False
            user.suspension_reason = None
            user.suspended_at = None
            user.suspension_until = None
            update_fields = [
                "is_blacklisted", "blacklist_reason", "blacklisted_at",
                "is_suspended", "suspension_reason", "suspended_at", "suspension_until",
            ]
        elif action == "unblacklist":
            user.is_blacklisted = False
            user.blacklist_reason = None
            user.blacklisted_at = None
            update_fields = ["is_blacklisted", "blacklist_reason", "blacklisted_at"]
        elif action == "disable_contact":
            user.can_contact = False
            update_fields = ["can_contact"]
        elif action == "enable_contact":
            user.can_contact = True
            update_fields = ["can_contact"]
        elif action == "deactivate":
            user.is_active = False
            update_fields = ["is_active"]

        user.save(update_fields=update_fields)

        return Response(
            {
                "detail": f"User {user.email} updated.",
                "user": AdminUserListSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class AdminUserDeleteView(APIView):
    """Hard-delete a user from the database when it is safe to do so."""

    permission_classes = [IsAdminUser]

    def delete(self, request, user_id):
        """Delete a non-self user while preserving admin safety guarantees."""
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own admin account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_is_admin = user.is_staff or user.is_superuser
        if target_is_admin:
            remaining_admins = User.objects.filter(
                Q(is_staff=True) | Q(is_superuser=True)
            ).exclude(pk=user.pk).count()

            if remaining_admins == 0:
                return Response(
                    {"detail": "Cannot delete the last admin or superuser account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not request.user.is_superuser:
                return Response(
                    {"detail": "Only a superuser can delete another admin account."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        email = user.email
        try:
            with transaction.atomic():
                user.delete()
        except (ProtectedError, RestrictedError):
            return Response(
                {
                    "detail": (
                        "User deletion is blocked because this account has protected "
                        "marketplace records. Deactivate or anonymize the account instead."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        except IntegrityError:
            return Response(
                {"detail": "User deletion failed because related database records are still linked."},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {"detail": f"User {email} was permanently deleted."},
            status=status.HTTP_200_OK,
        )
