from django.contrib import admin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """Expose the custom user model in Django admin."""

    list_display = [
        "username", "email", "filiere", "is_active", "is_verified",
        "is_suspended", "is_blacklisted", "can_contact", "overdue_count",
    ]
    list_filter = [
        "is_active", "is_suspended", "is_blacklisted", "can_contact", "is_verified", "filiere",
    ]
    search_fields = ["email", "username", "filiere"]
    ordering = ["-date_joined"]
    readonly_fields = ["suspended_at", "blacklisted_at", "overdue_count"]

    actions = ["suspend_selected_users", "blacklist_selected_users"]

    @admin.action(description="Suspend selected users")
    def suspend_selected_users(self, request, queryset):
        """Suspend selected users with a standard admin reason."""
        updated = queryset.update(
            is_suspended=True,
            suspension_reason="Manually suspended by admin",
        )
        self.message_user(
            request,
            f"{updated} user(s) have been suspended.",
        )

    @admin.action(description="Blacklist selected users")
    def blacklist_selected_users(self, request, queryset):
        """Blacklist selected users with a standard admin reason."""
        updated = queryset.update(
            is_blacklisted=True,
            blacklist_reason="Manually blacklisted by admin",
        )
        self.message_user(
            request,
            f"{updated} user(s) have been blacklisted.",
        )

