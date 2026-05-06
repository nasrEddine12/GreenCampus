"""Serializers for admin moderation endpoints."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class AdminUserListSerializer(serializers.ModelSerializer):
    """Read-only serializer for the admin user table.

    Exposes moderation-relevant fields without leaking passwords.
    """

    active_overdue_items = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "filiere",
            "is_verified",
            "is_suspended",
            "suspension_reason",
            "suspended_at",
            "suspension_until",
            "is_blacklisted",
            "blacklist_reason",
            "blacklisted_at",
            "can_contact",
            "overdue_count",
            "is_staff",
            "is_superuser",
            "is_active",
            "date_joined",
            "active_overdue_items",
        ]
        read_only_fields = fields

    def get_active_overdue_items(self, obj):
        """Return current overdue loans that explain an overdue suspension."""
        from marketplace.models import Transaction

        transactions = (
            Transaction.objects.filter(
                requester=obj,
                transaction_type=Transaction.Type.LOAN,
                status=Transaction.Status.OVERDUE,
                actual_return_date__isnull=True,
            )
            .select_related("listing")
            .order_by("expected_return_date")[:5]
        )
        return [
            {
                "id": transaction.id,
                "listing_title": transaction.listing.title,
                "expected_return_date": transaction.expected_return_date,
                "warning_sent_at": transaction.overdue_warning_sent_at,
            }
            for transaction in transactions
        ]


class ModerationActionSerializer(serializers.Serializer):
    """Validate the reason field for suspend / blacklist actions."""

    reason = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Explain why this action is being taken.",
    )


class AdminModerationActionSerializer(serializers.Serializer):
    """Validate a single admin moderation action."""

    ACTIONS = (
        "suspend",
        "unsuspend",
        "blacklist",
        "unblacklist",
        "enable_contact",
        "disable_contact",
        "deactivate",
    )

    action = serializers.ChoiceField(choices=ACTIONS)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)
    suspension_until = serializers.DateTimeField(required=False, allow_null=True)
