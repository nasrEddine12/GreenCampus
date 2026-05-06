"""API views for user registration, authentication, and profile management."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    EMAIL_VERIFICATION_MAX_AGE_SECONDS,
    EMAIL_VERIFICATION_SALT,
    LoginSerializer,
    RegisterSerializer,
    UserProfileSerializer,
)

User = get_user_model()


class RegisterView(APIView):
    """Handle user registration requests."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Create a new account and trigger email verification."""
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if settings.DEBUG:
            data = {"detail": "Account created successfully. You can now sign in."}
        else:
            data = {"detail": "Registration successful. Check your email to verify your account."}

        return Response(data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """Authenticate users and return a JWT token pair."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate credentials and issue access and refresh tokens."""
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


class VerifyEmailView(APIView):
    """Verify signed email tokens and activate student accounts."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Activate the user account tied to a valid verification token."""
        token = request.query_params.get("token")
        if not token:
            return Response({"detail": "Missing token."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = signing.loads(
                token,
                salt=EMAIL_VERIFICATION_SALT,
                max_age=EMAIL_VERIFICATION_MAX_AGE_SECONDS,
            )
        except signing.BadSignature:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_id = payload.get("user_id")
        if not user_id:
            return Response({"detail": "Invalid token payload."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if not user.is_verified:
            user.is_verified = True
            user.save(update_fields=["is_verified"])

        return Response({"detail": "Email verified successfully."}, status=status.HTTP_200_OK)


class ProfileView(APIView):
    """Retrieve and update the authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return profile data for the logged-in user."""
        request.user.expire_suspension_if_needed()
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        """Apply partial profile updates for the logged-in user."""
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """Invalidate a refresh token by adding it to the blacklist."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Blacklist the provided refresh token and finish logout."""
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Invalid or already blacklisted token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
