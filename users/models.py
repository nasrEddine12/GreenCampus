from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models


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

    # Blacklist
    is_blacklisted = models.BooleanField(default=False)
    blacklist_reason = models.TextField(blank=True, null=True)
    blacklisted_at = models.DateTimeField(blank=True, null=True)

    # Overdue tracking
    overdue_count = models.PositiveIntegerField(default=0)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email