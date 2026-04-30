from io import BytesIO
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Category, ContactMessage, Favorite, Listing

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
        self.category = Category.objects.create(name="Books", description="Used books")

    def authenticate(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def uploaded_image(self, name="listing.png"):
        buffer = BytesIO()
        image = Image.new("RGB", (2, 2), color="#18a957")
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
