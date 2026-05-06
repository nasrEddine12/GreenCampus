from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import EMAIL_VERIFICATION_SALT

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserApiTests(APITestCase):
    def setUp(self):
        self.register_url = reverse("users:register")
        self.login_url = reverse("users:login")
        self.verify_url = reverse("users:verify-email")
        self.profile_url = reverse("users:profile")
        self.logout_url = reverse("users:logout")

    def test_user_registration_sends_verification_email(self):
        payload = {
            "username": "nasser",
            "email": "nasser@emsi.ma",
            "password": "StrongPass123",
            "filiere": "GI",
            "phone": "0600000000",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="nasser@emsi.ma")
        self.assertFalse(user.is_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/api/users/verify-email/?token=", mail.outbox[0].body)

    def test_registration_rejects_non_emsi_email(self):
        payload = {
            "username": "nasser",
            "email": "nasser@gmail.com",
            "password": "StrongPass123",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only @emsi.ma email addresses are allowed.", str(response.data))

    def test_verified_user_can_login_and_receive_tokens(self):
        User.objects.create_user(
            username="verified",
            email="verified@emsi.ma",
            password="StrongPass123",
            is_verified=True,
        )

        response = self.client.post(
            self.login_url,
            {"email": "verified@emsi.ma", "password": "StrongPass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_unverified_user_is_blocked_from_login(self):
        User.objects.create_user(
            username="unverified",
            email="unverified@emsi.ma",
            password="StrongPass123",
            is_verified=False,
        )

        response = self.client.post(
            self.login_url,
            {"email": "unverified@emsi.ma", "password": "StrongPass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["detail"],
            "Email not verified. Please verify your email before logging in.",
        )

    def test_email_verification_endpoint_marks_user_verified(self):
        user = User.objects.create_user(
            username="verifyme",
            email="verifyme@emsi.ma",
            password="StrongPass123",
            is_verified=False,
        )
        token = signing.dumps({"user_id": user.id}, salt=EMAIL_VERIFICATION_SALT)

        response = self.client.get(self.verify_url, {"token": token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.is_verified)

    def test_profile_read_and_partial_update(self):
        user = User.objects.create_user(
            username="profile",
            email="profile@emsi.ma",
            password="StrongPass123",
            is_verified=True,
            filiere="SIC",
            phone="0611111111",
        )
        access_token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        get_response = self.client.get(self.profile_url)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data["email"], "profile@emsi.ma")

        patch_response = self.client.patch(
            self.profile_url,
            {"filiere": "Data Science", "phone": "0622222222"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["filiere"], "Data Science")
        self.assertEqual(patch_response.data["phone"], "0622222222")

    def test_logout_blacklists_refresh_token(self):
        User.objects.create_user(
            username="logout",
            email="logout@emsi.ma",
            password="StrongPass123",
            is_verified=True,
        )

        login_response = self.client.post(
            self.login_url,
            {"email": "logout@emsi.ma", "password": "StrongPass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        access = login_response.data["access"]
        refresh = login_response.data["refresh"]
        refresh_token = RefreshToken(refresh)
        jti = refresh_token["jti"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout_response = self.client.post(self.logout_url, {"refresh": refresh}, format="json")

        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)
        outstanding = OutstandingToken.objects.get(jti=jti)
        self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AdminModerationTests(APITestCase):
    """Tests for admin moderation endpoints (suspend, blacklist, reactivate)."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@emsi.ma",
            password="AdminPass123",
            is_verified=True,
            is_staff=True,
        )
        self.normal = User.objects.create_user(
            username="normaluser",
            email="normal@emsi.ma",
            password="NormalPass123",
            is_verified=True,
        )
        self.target = User.objects.create_user(
            username="target",
            email="target@emsi.ma",
            password="TargetPass123",
            is_verified=True,
        )
        self.login_url = reverse("users:login")
        self.suspend_url = reverse("users:admin-suspend", kwargs={"user_id": self.target.pk})
        self.blacklist_url = reverse("users:admin-blacklist", kwargs={"user_id": self.target.pk})
        self.reactivate_url = reverse("users:admin-reactivate", kwargs={"user_id": self.target.pk})
        self.moderation_url = reverse("users:admin-user-moderation", kwargs={"user_id": self.target.pk})
        self.delete_url = reverse("users:admin-user-delete", kwargs={"user_id": self.target.pk})

    def _auth_as(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # Ã¢â€â‚¬Ã¢â€â‚¬ 1. Admin can suspend a user Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_admin_can_suspend_user(self):
        self._auth_as(self.admin)
        response = self.client.post(
            self.suspend_url,
            {"reason": "Repeated violations"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_suspended)
        self.assertEqual(self.target.suspension_reason, "Repeated violations")
        self.assertIsNotNone(self.target.suspended_at)

    # Ã¢â€â‚¬Ã¢â€â‚¬ 2. Suspended user is blocked from login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_suspended_user_can_login_and_see_profile_status(self):
        self.target.is_suspended = True
        self.target.suspension_reason = "Test suspension"
        self.target.save(update_fields=["is_suspended", "suspension_reason"])

        response = self.client.post(
            self.login_url,
            {"email": "target@emsi.ma", "password": "TargetPass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        profile_response = self.client.get(reverse("users:profile"))
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertTrue(profile_response.data["is_suspended"])
        self.assertEqual(profile_response.data["suspension_reason"], "Test suspension")

    # Ã¢â€â‚¬Ã¢â€â‚¬ 3. Admin can blacklist a user Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_admin_can_blacklist_user(self):
        self._auth_as(self.admin)
        response = self.client.post(
            self.blacklist_url,
            {"reason": "Fraud detected"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_blacklisted)
        self.assertEqual(self.target.blacklist_reason, "Fraud detected")
        self.assertIsNotNone(self.target.blacklisted_at)

    # Ã¢â€â‚¬Ã¢â€â‚¬ 4. Blacklisted user is blocked from login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_blacklisted_user_blocked_from_login(self):
        self.target.is_blacklisted = True
        self.target.blacklist_reason = "Test blacklist"
        self.target.save(update_fields=["is_blacklisted", "blacklist_reason"])

        response = self.client.post(
            self.login_url,
            {"email": "target@emsi.ma", "password": "TargetPass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("blacklisted", response.data["detail"].lower())

    # Ã¢â€â‚¬Ã¢â€â‚¬ 5. Admin can reactivate a user Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_admin_can_reactivate_user(self):
        self.target.is_suspended = True
        self.target.is_blacklisted = True
        self.target.save(update_fields=["is_suspended", "is_blacklisted"])

        self._auth_as(self.admin)
        response = self.client.post(self.reactivate_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.target.refresh_from_db()
        self.assertFalse(self.target.is_suspended)
        self.assertFalse(self.target.is_blacklisted)
        self.assertIsNone(self.target.suspension_reason)
        self.assertIsNone(self.target.blacklist_reason)

    def test_admin_can_toggle_contact_and_deactivate_user(self):
        self._auth_as(self.admin)

        disable_response = self.client.post(
            self.moderation_url,
            {"action": "disable_contact", "reason": "DM abuse"},
            format="json",
        )
        self.assertEqual(disable_response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.can_contact)

        enable_response = self.client.post(
            self.moderation_url,
            {"action": "enable_contact"},
            format="json",
        )
        self.assertEqual(enable_response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.can_contact)

        deactivate_response = self.client.post(
            self.moderation_url,
            {"action": "deactivate", "reason": "Local test"},
            format="json",
        )
        self.assertEqual(deactivate_response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)

    def test_admin_cannot_moderate_admin_user(self):
        self._auth_as(self.admin)
        admin_url = reverse("users:admin-user-moderation", kwargs={"user_id": self.admin.pk})

        response = self.client.post(admin_url, {"action": "suspend", "reason": "Nope"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_delete_normal_user(self):
        self._auth_as(self.admin)

        response = self.client.delete(self.delete_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(pk=self.target.pk).exists())
        login_response = self.client.post(
            self.login_url,
            {"email": "target@emsi.ma", "password": "TargetPass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_normal_user_cannot_delete_user(self):
        self._auth_as(self.normal)

        response = self.client.delete(self.delete_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_admin_cannot_delete_self(self):
        self._auth_as(self.admin)
        self_url = reverse("users:admin-user-delete", kwargs={"user_id": self.admin.pk})

        response = self.client.delete(self_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_cannot_delete_last_admin_account(self):
        lone_admin = User.objects.create_user(
            username="loneadmin",
            email="loneadmin@emsi.ma",
            password="AdminPass123",
            is_verified=True,
            is_staff=True,
            is_superuser=True,
        )
        self.admin.is_staff = False
        self.admin.is_superuser = False
        self.admin.save(update_fields=["is_staff", "is_superuser"])
        self._auth_as(lone_admin)
        lone_delete_url = reverse("users:admin-user-delete", kwargs={"user_id": lone_admin.pk})

        response = self.client.delete(lone_delete_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=lone_admin.pk).exists())

    def test_staff_admin_cannot_delete_another_admin(self):
        other_admin = User.objects.create_user(
            username="otheradmin",
            email="otheradmin@emsi.ma",
            password="AdminPass123",
            is_verified=True,
            is_staff=True,
        )
        self._auth_as(self.admin)
        other_admin_url = reverse("users:admin-user-delete", kwargs={"user_id": other_admin.pk})

        response = self.client.delete(other_admin_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=other_admin.pk).exists())

    # Ã¢â€â‚¬Ã¢â€â‚¬ 6. Normal user cannot call moderation endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    def test_normal_user_cannot_call_moderation_endpoints(self):
        self._auth_as(self.normal)

        for url in [self.suspend_url, self.blacklist_url, self.reactivate_url, self.moderation_url]:
            response = self.client.post(url, {"reason": "Attempt", "action": "suspend"}, format="json")
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Non-admin should be blocked from {url}",
            )

        # Also test the list endpoint
        list_url = reverse("users:admin-user-list")
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        stats_url = reverse("users:admin-stats")
        response = self.client.get(stats_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_stats_returns_chart_datasets(self):
        self._auth_as(self.admin)
        stats_url = reverse("users:admin-stats")

        response = self.client.get(stats_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("chart_total_users_over_time", response.data)
        self.assertIn("chart_new_users_by_day", response.data)
        self.assertIn("chart_users_by_filiere", response.data)
        self.assertIn("chart_listings_by_status", response.data)
        self.assertIn("chart_contact_messages_over_time", response.data)
