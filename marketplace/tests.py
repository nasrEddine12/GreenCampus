from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Category, Favorite, Listing

User = get_user_model()


class MarketplaceApiTests(APITestCase):
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
        }

        response = self.client.post(reverse("marketplace:listing-list-create"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        listing = Listing.objects.get(pk=response.data["id"])
        self.assertEqual(listing.seller, self.seller)

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
