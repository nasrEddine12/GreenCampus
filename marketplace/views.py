from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly

from .models import Category, Favorite, Listing, Report, Review, Transaction
from .permissions import IsListingOwnerOrReadOnly, IsTransactionParticipant
from .serializers import (
    CategorySerializer,
    FavoriteSerializer,
    ListingSerializer,
    ReportSerializer,
    ReviewSerializer,
    TransactionSerializer,
)


class CategoryListCreateView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]


class ListingListCreateView(generics.ListCreateAPIView):
    serializer_class = ListingSerializer

    def get_queryset(self):
        queryset = Listing.objects.select_related("seller", "category").all()

        search = self.request.query_params.get("q")
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))

        category = self.request.query_params.get("category")
        if category:
            if category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__slug=category)

        available = self.request.query_params.get("available")
        if available is not None:
            queryset = queryset.filter(is_available=available.lower() == "true")

        return queryset

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


class ListingDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Listing.objects.select_related("seller", "category").all()
    serializer_class = ListingSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsListingOwnerOrReadOnly]


class FavoriteListCreateView(generics.ListCreateAPIView):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related(
            "listing", "listing__seller", "listing__category"
        )


class FavoriteDeleteView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return get_object_or_404(
            Favorite.objects.select_related("listing"),
            user=self.request.user,
            listing_id=self.kwargs["listing_id"],
        )


class TransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(
            Q(borrower=self.request.user) | Q(lender=self.request.user)
        ).select_related("listing", "borrower", "lender")


class TransactionDetailView(generics.RetrieveUpdateAPIView):
    queryset = Transaction.objects.select_related("listing", "borrower", "lender")
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, IsTransactionParticipant]


class ReviewListCreateView(generics.ListCreateAPIView):
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        reviewed_user = self.request.query_params.get("reviewed_user")
        queryset = Review.objects.select_related("transaction", "reviewer", "reviewed_user")
        if reviewed_user:
            return queryset.filter(reviewed_user_id=reviewed_user)
        return queryset.filter(reviewed_user=self.request.user)


class ReportListCreateView(generics.ListCreateAPIView):
    serializer_class = ReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_staff:
            return Report.objects.select_related("reporter", "listing", "reported_user")
        return Report.objects.filter(reporter=self.request.user).select_related(
            "reporter", "listing", "reported_user"
        )
