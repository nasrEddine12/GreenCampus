from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def validate_emsi_email(value):

    if not value.endswith('@emsi.ma'):
        raise ValidationError("Only @emsi.ma email addresses are allowed.")


class User(AbstractUser):
    """Custom user model for Green Campus marketplace."""

    email = models.EmailField(unique=True, validators=[validate_emsi_email])
    filiere = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Verification
    is_verified = models.BooleanField(default=False)

    # Suspension
    is_suspended = models.BooleanField(default=False)
    suspension_reason = models.TextField(blank=True, null=True)
    suspended_at = models.DateTimeField(blank=True, null=True)
    suspension_until = models.DateTimeField(blank=True, null=True)

    # Blacklist
    is_blacklisted = models.BooleanField(default=False)
    blacklist_reason = models.TextField(blank=True, null=True)
    blacklisted_at = models.DateTimeField(blank=True, null=True)

    # Contact permissions
    can_contact = models.BooleanField(default=True)

    # Overdue tracking
    overdue_count = models.PositiveIntegerField(default=0)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def is_overdue_suspension(self):
        """Return whether the active suspension came from overdue loan enforcement."""
        return "overdue" in (self.suspension_reason or "").lower()

    def suspension_is_active(self):
        if not self.is_suspended:
            return False
        if self.is_overdue_suspension():
            return True
        if self.suspension_until and self.suspension_until <= timezone.now():
            return False
        return True

    def expire_suspension_if_needed(self, save=True):
        if not self.is_suspended or not self.suspension_until:
            return False
        if self.is_overdue_suspension():
            return False
        if self.suspension_until > timezone.now():
            return False

        self.is_suspended = False
        self.can_contact = True
        if save:
            self.save(update_fields=["is_suspended", "can_contact"])
        return True

    def __str__(self):
        return self.email
