"""Permission classes for the users app."""

from rest_framework.permissions import BasePermission


class IsAdminUser(BasePermission):
    """Allow access only to admin / staff users."""

    message = "Admin privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )
