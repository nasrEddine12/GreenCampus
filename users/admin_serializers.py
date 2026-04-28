"""Serializers for admin moderation endpoints."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class AdminUserListSerializer(serializers.ModelSerializer):
    """Read-only serializer for the admin user table.

    Exposes moderation-relevant fields without leaking passwords.
    """

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
            "is_blacklisted",
            "blacklist_reason",
            "blacklisted_at",
            "overdue_count",
            "is_staff",
            "is_active",
            "date_joined",
        ]
        read_only_fields = fields


class ModerationActionSerializer(serializers.Serializer):
    """Validate the reason field for suspend / blacklist actions."""

    reason = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Explain why this action is being taken.",
    )
