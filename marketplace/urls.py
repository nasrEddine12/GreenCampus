from django.urls import path

from . import views

app_name = "marketplace"

urlpatterns = [
    path("categories/", views.CategoryListCreateView.as_view(), name="category-list-create"),
    path("listings/", views.ListingListCreateView.as_view(), name="listing-list-create"),
    path("listings/mine/", views.MyListingListView.as_view(), name="my-listings"),
    path("listings/<int:pk>/", views.ListingDetailView.as_view(), name="listing-detail"),
    path("messages/", views.ContactMessageListCreateView.as_view(), name="message-list-create"),
    path("messages/<int:pk>/", views.ContactMessageDetailView.as_view(), name="message-detail"),
    path("favorites/", views.FavoriteListCreateView.as_view(), name="favorite-list-create"),
    path("favorites/<int:listing_id>/", views.FavoriteDeleteView.as_view(), name="favorite-delete"),
    path("transactions/", views.TransactionListCreateView.as_view(), name="transaction-list-create"),
    path("transactions/<int:pk>/", views.TransactionDetailView.as_view(), name="transaction-detail"),
    path("reviews/", views.ReviewListCreateView.as_view(), name="review-list-create"),
    path("reports/", views.ReportListCreateView.as_view(), name="report-list-create"),
]
