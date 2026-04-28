"""Serializers for user authentication and profile endpoints."""

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core import signing
from django.core.mail import send_mail
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

User = get_user_model()
EMAIL_VERIFICATION_SALT = "email-verify"
EMAIL_VERIFICATION_MAX_AGE_SECONDS = 60 * 60 * 24


class RegisterSerializer(serializers.ModelSerializer):
    """Register a new EMSI user and send a verification email."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password", "filiere", "phone"]

    def validate_email(self, value):
        """Ensure registration uses only @emsi.ma addresses."""
        email = value.strip().lower()
        if not email.endswith("@emsi.ma"):
            raise serializers.ValidationError("Only @emsi.ma email addresses are allowed.")
        return email

    def create(self, validated_data):
        """Create the user with a hashed password and trigger verification email."""
        user = User.objects.create_user(**validated_data)
        token, verify_url = self._send_verification_email(user)
        # Store for the view to use in DEBUG mode
        self._verification_token = token
        self._verification_url = verify_url
        return user

    def _send_verification_email(self, user):
        """Send a signed verification link to the newly created account."""
        token = signing.dumps({"user_id": user.pk}, salt=EMAIL_VERIFICATION_SALT)
        verify_url = self._build_verify_url(token)

        # Always print clearly to console so developers can grab the token
        import sys
        print(
            f"\n{'=' * 60}\n"
            f"  EMAIL VERIFICATION for {user.email}\n"
            f"  Token: {token}\n"
            f"  URL:   {verify_url}\n"
            f"{'=' * 60}\n",
            file=sys.stderr,
            flush=True,
        )

        mail_kwargs = {
            "subject": "Green Campus - Verify your email",
            "message": (
                f"Hi {user.username},\n\n"
                f"Please verify your Green Campus account:\n{verify_url}\n\n"
                f"This link expires in {EMAIL_VERIFICATION_MAX_AGE_SECONDS // 3600} hours."
            ),
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "recipient_list": [user.email],
            "fail_silently": True,
        }
        try:
            send_mail(**mail_kwargs)
        except Exception:
            pass  # Console print above is the reliable channel in dev

        return token, verify_url

    def _build_verify_url(self, token):
        """Build an absolute backend verification URL for the signed token."""
        request = self.context.get("request")
        path = f"/api/users/verify-email/?token={token}"
        if request is not None:
            return request.build_absolute_uri(path)
        backend_url = getattr(settings, "BACKEND_URL", "http://localhost:8000").rstrip("/")
        return f"{backend_url}{path}"


class LoginSerializer(serializers.Serializer):
    """Authenticate a user using email and password credentials."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        """Validate login credentials and return the authenticated user."""
        email = attrs["email"].strip().lower()
        user = authenticate(
            request=self.context.get("request"),
            email=email,
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError({"detail": "Invalid email or password."})

        if getattr(settings, "EMAIL_VERIFICATION_REQUIRED", True) and not user.is_verified:
            raise PermissionDenied(
                detail="Email not verified. Please verify your email before logging in."
            )

        if user.is_blacklisted:
            raise PermissionDenied(
                detail="Your account is blacklisted."
            )

        if user.is_suspended:
            raise PermissionDenied(
                detail="Your account is suspended."
            )

        attrs["user"] = user
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    """Serialize profile fields that the user can view and edit."""

    class Meta:
        model = User
        fields = [
            "username", "email", "filiere", "phone",
            "is_verified", "is_suspended", "is_blacklisted", "is_staff",
        ]
        read_only_fields = [
            "username", "email", "is_verified",
            "is_suspended", "is_blacklisted", "is_staff",
        ]