from io import BytesIO
import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Category, ContactMessage, Favorite, Listing, OVERDUE_WARNING_MESSAGE, Transaction

User = get_user_model()
TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="green-campus-test-media-")


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class MarketplaceApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller",
            email="seller@emsi.ma",
            password="StrongPass123",
            is_verified=True,
        )
        self.buyer = User.objects.create_user(
            username="buyer",
            email="buyer@emsi.ma",
            password="StrongPass123",
            is_verified=True,
        )
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@emsi.ma",
            password="StrongPass123",
            is_verified=True,
            is_staff=True,
        )
        self.category = Category.objects.create(name="Books", description="Used books")

    def authenticate(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def uploaded_image(self, name="listing.png", size=(2, 2)):
        buffer = BytesIO()
        image = Image.new("RGB", size, color="#18a957")
        image.save(buffer, format="PNG")
        return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")

    def test_public_can_list_categories(self):
        response = self.client.get(reverse("marketplace:category-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_authenticated_user_can_create_listing(self):
        self.authenticate(self.seller)
        payload = {
            "category": self.category.id,
            "title": "Solar Lamp",
            "description": "Portable solar study lamp",
            "condition": "good",
            "price": "120.00",
            "eco_score": 85,
            "is_available": True,
            "image": self.uploaded_image(),
        }

        response = self.client.post(reverse("marketplace:listing-list-create"), payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        listing = Listing.objects.get(pk=response.data["id"])
        self.assertEqual(listing.seller, self.seller)
        self.assertTrue(listing.image.name.startswith("listings/"))
        self.assertIn("/media/listings/", response.data["image_url"])

    def test_listing_create_requires_image(self):
        self.authenticate(self.seller)
        payload = {
            "category": self.category.id,
            "title": "No Photo Item",
            "description": "Should not be accepted",
            "condition": "good",
            "price": "10.00",
            "eco_score": 10,
            "is_available": True,
        }

        response = self.client.post(reverse("marketplace:listing-list-create"), payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("image", response.data)

    def test_high_resolution_listing_image_keeps_original_quality(self):
        self.authenticate(self.seller)
        payload = {
            "category": self.category.id,
            "title": "High Resolution Bike",
            "description": "Sharp listing image test",
            "condition": "good",
            "price": "250.00",
            "eco_score": 70,
            "is_available": True,
            "image": self.uploaded_image("high-res-listing.png", size=(1600, 1000)),
        }

        response = self.client.post(reverse("marketplace:listing-list-create"), payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("/media/listings/", response.data["image_url"])
        listing = Listing.objects.get(pk=response.data["id"])
        with Image.open(listing.image.path) as stored_image:
            self.assertEqual(stored_image.size, (1600, 1000))

    def test_user_can_favorite_and_unfavorite_listing(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Reusable Bottle",
            description="Insulated steel bottle",
            condition="like_new",
            price="90.00",
            eco_score=70,
        )
        self.authenticate(self.buyer)

        create_response = self.client.post(
            reverse("marketplace:favorite-list-create"),
            {"listing_id": listing.id},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Favorite.objects.filter(user=self.buyer, listing=listing).exists())

        delete_response = self.client.delete(reverse("marketplace:favorite-delete", kwargs={"listing_id": listing.id}))
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Favorite.objects.filter(user=self.buyer, listing=listing).exists())

    def test_listing_filters_and_my_listings_use_real_data(self):
        mine = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Engineering Calculator",
            description="Casio calculator for exams",
            campus="EMSI Maarif",
            condition="good",
            price="150.00",
            eco_score=60,
        )
        Listing.objects.create(
            seller=self.buyer,
            category=self.category,
            title="Old Notebook",
            description="Reusable notes",
            condition="fair",
            price="20.00",
            eco_score=90,
            is_available=False,
        )
        self.authenticate(self.seller)

        response = self.client.get(
            reverse("marketplace:listing-list-create"),
            {"q": "calculator", "condition": "good", "min_price": "100", "available": "true"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], mine.id)

        mine_response = self.client.get(reverse("marketplace:my-listings"))
        self.assertEqual(mine_response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in mine_response.data], [mine.id])

    def test_buyer_can_send_contact_message_and_seller_can_read_it(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Python Book",
            description="Clean copy",
            condition="like_new",
            price="80.00",
            eco_score=75,
        )
        self.authenticate(self.buyer)

        response = self.client.post(
            reverse("marketplace:message-list-create"),
            {"listing_id": listing.id, "message": "Is this still available?"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = ContactMessage.objects.get(pk=response.data["id"])
        self.assertEqual(message.sender, self.buyer)
        self.assertEqual(message.recipient, self.seller)
        self.assertEqual(message.listing, listing)

        self.authenticate(self.seller)
        inbox = self.client.get(reverse("marketplace:message-list-create"), {"box": "received"})
        self.assertEqual(inbox.status_code, status.HTTP_200_OK)
        self.assertEqual(len(inbox.data), 1)
        self.assertEqual(inbox.data[0]["message"], "Is this still available?")

    def test_contact_disabled_user_cannot_send_contact_message(self):
        self.buyer.can_contact = False
        self.buyer.save(update_fields=["can_contact"])
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Django Book",
            description="Clean copy",
            condition="good",
            price="70.00",
            eco_score=75,
        )
        self.authenticate(self.buyer)

        response = self.client.post(
            reverse("marketplace:message-list-create"),
            {"listing_id": listing.id, "message": "Can I buy it?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ContactMessage.objects.exists())

    def test_normal_user_cannot_edit_other_users_listing(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Borrowable Projector",
            description="For class presentations",
            condition="good",
            price="50.00",
            eco_score=50,
        )
        self.authenticate(self.buyer)

        response = self.client.patch(
            reverse("marketplace:listing-detail", kwargs={"pk": listing.id}),
            {"title": "Changed title"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_loan_transaction_flow_updates_listing_statuses(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Engineering Calculator",
            description="Loan for three days",
            listing_type=Listing.Type.LOAN,
            campus="EMSI Casablanca",
            condition="good",
            price="30.00",
            eco_score=80,
        )

        today = timezone.localdate()
        self.authenticate(self.buyer)
        create_response = self.client.post(
            reverse("marketplace:transaction-list-create"),
            {
                "listing_id": listing.id,
                "message": "Can I borrow this for revision week?",
                "meeting_location": "EMSI library lobby",
                "meeting_datetime": f"{today.isoformat()}T10:00:00Z",
                "requested_start_date": today.isoformat(),
                "expected_return_date": (today + timedelta(days=3)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        transaction_id = create_response.data["id"]
        self.assertEqual(create_response.data["status"], Transaction.Status.PENDING)
        self.assertEqual(create_response.data["transaction_type"], Transaction.Type.LOAN)

        self.authenticate(self.seller)
        accept_response = self.client.post(
            reverse("marketplace:transaction-accept", kwargs={"pk": transaction_id}),
            {"seller_note": "Accepted, let's meet on campus."},
            format="json",
        )
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
        listing.refresh_from_db()
        self.assertEqual(listing.status, Listing.Status.RESERVED)

        handover_response = self.client.post(
            reverse("marketplace:transaction-handover", kwargs={"pk": transaction_id}),
            {"seller_note": "Handed over in person."},
            format="json",
        )
        self.assertEqual(handover_response.status_code, status.HTTP_200_OK)
        self.assertEqual(handover_response.data["status"], Transaction.Status.ACTIVE_LOAN)
        listing.refresh_from_db()
        self.assertEqual(listing.status, Listing.Status.LOANED)

        return_response = self.client.post(
            reverse("marketplace:transaction-return", kwargs={"pk": transaction_id}),
            {"actual_return_date": today.isoformat()},
            format="json",
        )
        self.assertEqual(return_response.status_code, status.HTTP_200_OK)
        self.assertEqual(return_response.data["status"], Transaction.Status.RETURNED)
        listing.refresh_from_db()
        self.assertEqual(listing.status, Listing.Status.AVAILABLE)

    def test_sale_transaction_flow_marks_listing_sold(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Laptop Stand",
            description="Adjustable stand",
            listing_type=Listing.Type.SALE,
            condition="like_new",
            price="120.00",
            eco_score=55,
        )

        self.authenticate(self.buyer)
        create_response = self.client.post(
            reverse("marketplace:transaction-list-create"),
            {"listing_id": listing.id, "message": "I'd like to buy this."},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        transaction_id = create_response.data["id"]

        self.authenticate(self.seller)
        accept_response = self.client.post(reverse("marketplace:transaction-accept", kwargs={"pk": transaction_id}), {}, format="json")
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)

        sold_response = self.client.post(
            reverse("marketplace:transaction-sold", kwargs={"pk": transaction_id}),
            {"seller_note": "Paid and collected."},
            format="json",
        )
        self.assertEqual(sold_response.status_code, status.HTTP_200_OK)
        self.assertEqual(sold_response.data["status"], Transaction.Status.SOLD)
        listing.refresh_from_db()
        self.assertEqual(listing.status, Listing.Status.SOLD)

    def test_admin_overdue_transactions_endpoint_marks_overdue_and_updates_user_count(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Scientific Calculator",
            description="Loaned calculator",
            listing_type=Listing.Type.LOAN,
            condition="good",
            price="25.00",
            eco_score=64,
            status=Listing.Status.LOANED,
            is_available=False,
        )
        transaction = Transaction.objects.create(
            listing=listing,
            requester=self.buyer,
            seller=self.seller,
            transaction_type=Transaction.Type.LOAN,
            status=Transaction.Status.ACTIVE_LOAN,
            requested_start_date=timezone.localdate() - timedelta(days=5),
            expected_return_date=timezone.localdate() - timedelta(days=1),
            price="25.00",
            message="Borrow request",
        )

        self.authenticate(self.admin)
        response = self.client.get(reverse("marketplace:admin-transaction-overdue"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], transaction.id)
        self.assertEqual(response.data[0]["status"], Transaction.Status.OVERDUE)

        transaction.refresh_from_db()
        self.assertIsNotNone(transaction.overdue_warning_sent_at)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.overdue_count, 1)

    def test_overdue_notification_warns_borrower(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Graphing Calculator",
            description="Borrowed calculator",
            listing_type=Listing.Type.LOAN,
            condition="good",
            price="25.00",
            eco_score=64,
            status=Listing.Status.LOANED,
            is_available=False,
        )
        transaction = Transaction.objects.create(
            listing=listing,
            requester=self.buyer,
            seller=self.seller,
            transaction_type=Transaction.Type.LOAN,
            status=Transaction.Status.ACTIVE_LOAN,
            requested_start_date=timezone.localdate() - timedelta(days=5),
            expected_return_date=timezone.localdate() - timedelta(days=1),
            price="25.00",
            message="Borrow request",
        )

        self.authenticate(self.buyer)
        response = self.client.get(reverse("marketplace:notification-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["type"], "overdue_warning")
        self.assertEqual(response.data[0]["message"], OVERDUE_WARNING_MESSAGE)
        self.assertEqual(response.data[0]["transaction_id"], transaction.id)
        self.assertIsNotNone(response.data[0]["deadline"])

        transaction.refresh_from_db()
        self.assertEqual(transaction.status, Transaction.Status.OVERDUE)
        self.assertIsNotNone(transaction.overdue_warning_sent_at)

    def test_admin_can_apply_overdue_suspension_and_user_actions_are_blocked(self):
        listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Borrowed Projector",
            description="Return was missed",
            listing_type=Listing.Type.LOAN,
            condition="good",
            price="40.00",
            eco_score=50,
            status=Listing.Status.LOANED,
            is_available=False,
        )
        Transaction.objects.create(
            listing=listing,
            requester=self.buyer,
            seller=self.seller,
            transaction_type=Transaction.Type.LOAN,
            status=Transaction.Status.OVERDUE,
            requested_start_date=timezone.localdate() - timedelta(days=5),
            expected_return_date=timezone.localdate() - timedelta(days=2),
            overdue_warning_sent_at=timezone.now() - timedelta(hours=25),
            price="40.00",
            message="Borrow request",
        )

        self.authenticate(self.admin)
        suspension_response = self.client.post(reverse("marketplace:admin-apply-overdue-suspensions"), {}, format="json")
        self.assertEqual(suspension_response.status_code, status.HTTP_200_OK)
        self.assertEqual(suspension_response.data["suspended_count"], 1)

        self.buyer.refresh_from_db()
        self.assertTrue(self.buyer.is_suspended)
        self.assertFalse(self.buyer.can_contact)
        self.assertIn("Automatic overdue suspension", self.buyer.suspension_reason)
        self.assertGreater(self.buyer.suspension_until, timezone.now() + timedelta(days=6))

        self.authenticate(self.buyer)
        blocked_listing_response = self.client.post(
            reverse("marketplace:listing-list-create"),
            {
                "category": self.category.id,
                "title": "Blocked Listing",
                "description": "Suspended users cannot post",
                "condition": "good",
                "price": "10.00",
                "eco_score": 10,
                "is_available": True,
                "image": self.uploaded_image("blocked.png"),
            },
            format="multipart",
        )
        self.assertEqual(blocked_listing_response.status_code, status.HTTP_403_FORBIDDEN)

        available_listing = Listing.objects.create(
            seller=self.seller,
            category=self.category,
            title="Available Book",
            description="Can be sold",
            listing_type=Listing.Type.SALE,
            condition="good",
            price="20.00",
            eco_score=30,
        )

        request_response = self.client.post(
            reverse("marketplace:transaction-list-create"),
            {"listing_id": available_listing.id, "message": "Can I buy it?"},
            format="json",
        )
        self.assertEqual(request_response.status_code, status.HTTP_400_BAD_REQUEST)

        contact_response = self.client.post(
            reverse("marketplace:message-list-create"),
            {"listing_id": available_listing.id, "message": "Is this available?"},
            format="json",
        )
        self.assertEqual(contact_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_normal_user_cannot_access_admin_transaction_endpoints(self):
        self.authenticate(self.buyer)
        response = self.client.get(reverse("marketplace:admin-transaction-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
