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
    path("notifications/", views.NotificationListView.as_view(), name="notification-list"),
    path("favorites/", views.FavoriteListCreateView.as_view(), name="favorite-list-create"),
    path("favorites/<int:listing_id>/", views.FavoriteDeleteView.as_view(), name="favorite-delete"),
    path("transactions/", views.TransactionListCreateView.as_view(), name="transaction-list-create"),
    path("transactions/sent/", views.MySentTransactionListView.as_view(), name="transaction-sent"),
    path("transactions/received/", views.MyReceivedTransactionListView.as_view(), name="transaction-received"),
    path("transactions/<int:pk>/", views.TransactionDetailView.as_view(), name="transaction-detail"),
    path("transactions/<int:pk>/accept/", views.TransactionAcceptView.as_view(), name="transaction-accept"),
    path("transactions/<int:pk>/reject/", views.TransactionRejectView.as_view(), name="transaction-reject"),
    path("transactions/<int:pk>/cancel/", views.TransactionCancelView.as_view(), name="transaction-cancel"),
    path("transactions/<int:pk>/meeting/", views.TransactionMeetingView.as_view(), name="transaction-meeting"),
    path("transactions/<int:pk>/handover/", views.TransactionHandOverView.as_view(), name="transaction-handover"),
    path("transactions/<int:pk>/return/", views.TransactionReturnView.as_view(), name="transaction-return"),
    path("transactions/<int:pk>/sold/", views.TransactionMarkSoldView.as_view(), name="transaction-sold"),
    path("transactions/<int:pk>/complete/", views.TransactionCompleteView.as_view(), name="transaction-complete"),
    path("admin/transactions/", views.AdminTransactionListView.as_view(), name="admin-transaction-list"),
    path(
        "admin/transactions/overdue/",
        views.AdminOverdueTransactionListView.as_view(),
        name="admin-transaction-overdue",
    ),
    path(
        "admin/transactions/<int:pk>/resolve/",
        views.AdminTransactionResolveView.as_view(),
        name="admin-transaction-resolve",
    ),
    path(
        "admin/transactions/apply-overdue-suspensions/",
        views.AdminApplyOverdueSuspensionsView.as_view(),
        name="admin-apply-overdue-suspensions",
    ),
    path("reviews/", views.ReviewListCreateView.as_view(), name="review-list-create"),
    path("reports/", views.ReportListCreateView.as_view(), name="report-list-create"),
]
