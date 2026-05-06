from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsAdminUser

from .models import (
    Category,
    ContactMessage,
    Favorite,
    Listing,
    Report,
    Review,
    Transaction,
    OVERDUE_WARNING_HOURS,
    OVERDUE_WARNING_MESSAGE,
    SUSPENDED_MARKETPLACE_ACTION_MESSAGE,
    apply_overdue_suspensions,
    refresh_overdue_transactions,
)
from .permissions import (
    IsContactParticipant,
    IsListingOwnerOrReadOnly,
    IsTransactionParticipant,
)
from .serializers import (
    AdminTransactionResolveSerializer,
    CategorySerializer,
    ContactMessageSerializer,
    ContactMessageUpdateSerializer,
    FavoriteSerializer,
    ListingSerializer,
    ReportSerializer,
    ReviewSerializer,
    TransactionCompleteSerializer,
    TransactionCreateSerializer,
    TransactionDecisionSerializer,
    TransactionMeetingSerializer,
    TransactionReturnSerializer,
    TransactionSerializer,
)


OPEN_TRANSACTION_STATUSES = {
    Transaction.Status.PENDING,
    Transaction.Status.ACCEPTED,
    Transaction.Status.MEETING_SCHEDULED,
    Transaction.Status.HANDED_OVER,
    Transaction.Status.ACTIVE_LOAN,
    Transaction.Status.OVERDUE,
}


def transaction_queryset():
    return Transaction.objects.select_related(
        "listing",
        "listing__category",
        "seller",
        "requester",
        "resolved_by",
    )


def ensure_transaction_access(request, transaction, *, seller_only=False, requester_only=False):
    user = request.user
    if user.is_staff or user.is_superuser:
        return

    if seller_only and transaction.seller_id != user.id:
        raise PermissionDenied("Only the seller can perform this action.")

    if requester_only and transaction.requester_id != user.id:
        raise PermissionDenied("Only the requester can perform this action.")

    if not seller_only and not requester_only and user.id not in {transaction.seller_id, transaction.requester_id}:
        raise PermissionDenied("You do not have access to this transaction.")


def serialize_transaction(request, transaction, status_code=status.HTTP_200_OK):
    serializer = TransactionSerializer(transaction, context={"request": request})
    return Response(serializer.data, status=status_code)


def sync_listing_status(listing):
    listing_transactions = listing.transactions.all()

    if listing_transactions.filter(status__in=[Transaction.Status.ACTIVE_LOAN, Transaction.Status.OVERDUE]).exists():
        target_status = Listing.Status.LOANED
    elif listing_transactions.filter(
        transaction_type=Transaction.Type.SALE,
        status=Transaction.Status.SOLD,
    ).exists():
        target_status = Listing.Status.SOLD
    elif listing_transactions.filter(
        transaction_type=Transaction.Type.EXCHANGE,
        status=Transaction.Status.COMPLETED,
    ).exists():
        target_status = Listing.Status.EXCHANGED
    elif listing_transactions.filter(
        transaction_type=Transaction.Type.DONATE,
        status=Transaction.Status.COMPLETED,
    ).exists():
        target_status = Listing.Status.DONATED
    elif listing_transactions.filter(
        status__in=[
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        ]
    ).exists():
        target_status = Listing.Status.RESERVED
    else:
        target_status = Listing.Status.AVAILABLE

    if listing.status != target_status or listing.is_available != (target_status == Listing.Status.AVAILABLE):
        listing.status = target_status
        listing.save()


def close_competing_transactions(transaction):
    competitors = transaction.listing.transactions.exclude(pk=transaction.pk).exclude(
        status__in=[
            Transaction.Status.REJECTED,
            Transaction.Status.CANCELLED,
            Transaction.Status.COMPLETED,
            Transaction.Status.SOLD,
            Transaction.Status.RETURNED,
        ]
    )

    for competitor in competitors:
        competitor.status = (
            Transaction.Status.REJECTED
            if competitor.status == Transaction.Status.PENDING
            else Transaction.Status.CANCELLED
        )
        competitor.save()


def filter_transaction_queryset(queryset, request):
    refresh_overdue_transactions()

    params = request.query_params

    search = params.get("search") or params.get("q")
    if search:
        queryset = queryset.filter(
            Q(listing__title__icontains=search)
            | Q(requester__username__icontains=search)
            | Q(requester__email__icontains=search)
            | Q(seller__username__icontains=search)
            | Q(seller__email__icontains=search)
            | Q(message__icontains=search)
        )

    transaction_type = params.get("transaction_type") or params.get("type")
    if transaction_type:
        queryset = queryset.filter(transaction_type=transaction_type)

    transaction_status = params.get("status")
    if transaction_status:
        queryset = queryset.filter(status=transaction_status)

    meeting_status = params.get("meeting_status")
    if meeting_status:
        queryset = queryset.filter(meeting_status=meeting_status)

    listing_status = params.get("listing_status")
    if listing_status:
        queryset = queryset.filter(listing__status=listing_status)

    if params.get("overdue") == "true":
        queryset = queryset.filter(status=Transaction.Status.OVERDUE)

    date_from = params.get("date_from")
    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    date_to = params.get("date_to")
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    sort = params.get("sort", "newest")
    ordering = {
        "oldest": "created_at",
        "meeting": "meeting_datetime",
        "return_due": "expected_return_date",
        "newest": "-created_at",
    }
    return queryset.order_by(ordering.get(sort, "-created_at"))


class CategoryListCreateView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]


class ListingListCreateView(generics.ListCreateAPIView):
    serializer_class = ListingSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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

        condition = self.request.query_params.get("condition")
        if condition:
            queryset = queryset.filter(condition=condition)

        listing_type = self.request.query_params.get("listing_type")
        if listing_type:
            queryset = queryset.filter(listing_type=listing_type)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        min_price = self.request.query_params.get("min_price")
        if min_price:
            queryset = queryset.filter(price__gte=min_price)

        max_price = self.request.query_params.get("max_price")
        if max_price:
            queryset = queryset.filter(price__lte=max_price)

        owner = self.request.query_params.get("owner")
        if owner == "me" and self.request.user.is_authenticated:
            queryset = queryset.filter(seller=self.request.user)

        sort = self.request.query_params.get("sort")
        ordering = {
            "oldest": "created_at",
            "price_asc": "price",
            "price_desc": "-price",
            "newest": "-created_at",
        }
        queryset = queryset.order_by(ordering.get(sort, "-created_at"))

        return queryset

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if self.request.user.suspension_is_active():
            raise PermissionDenied(SUSPENDED_MARKETPLACE_ACTION_MESSAGE)
        serializer.save(seller=self.request.user)


class ListingDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Listing.objects.select_related("seller", "category").all()
    serializer_class = ListingSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsAuthenticatedOrReadOnly, IsListingOwnerOrReadOnly]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This listing has transaction history and cannot be deleted. "
                        "Hide it instead to preserve marketplace records."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyListingListView(generics.ListAPIView):
    serializer_class = ListingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Listing.objects.filter(seller=self.request.user).select_related("seller", "category")


class ContactMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ContactMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ContactMessage.objects.filter(
            Q(sender=self.request.user) | Q(recipient=self.request.user)
        ).select_related("listing", "listing__category", "sender", "recipient")

        box = self.request.query_params.get("box", "").lower()
        if box == "sent":
            queryset = queryset.filter(sender=self.request.user)
        elif box == "received":
            queryset = queryset.filter(recipient=self.request.user)

        listing_id = self.request.query_params.get("listing")
        if listing_id:
            queryset = queryset.filter(listing_id=listing_id)

        return queryset


class ContactMessageDetailView(generics.RetrieveUpdateAPIView):
    queryset = ContactMessage.objects.select_related("listing", "listing__category", "sender", "recipient")
    serializer_class = ContactMessageSerializer
    permission_classes = [IsAuthenticated, IsContactParticipant]

    def get_serializer_class(self):
        if self.request.method in {"PUT", "PATCH"}:
            return ContactMessageUpdateSerializer
        return ContactMessageSerializer


class FavoriteListCreateView(generics.ListCreateAPIView):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related(
            "listing",
            "listing__seller",
            "listing__category",
        )


class FavoriteDeleteView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return get_object_or_404(
            Favorite.objects.select_related("listing"),
            user=self.request.user,
            listing_id=self.kwargs["listing_id"],
        )


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        refresh_overdue_transactions()

        notifications = []
        overdue_transactions = transaction_queryset().filter(
            requester=request.user,
            transaction_type=Transaction.Type.LOAN,
            status=Transaction.Status.OVERDUE,
            actual_return_date__isnull=True,
        )

        for transaction in overdue_transactions:
            deadline = None
            if transaction.overdue_warning_sent_at:
                deadline = transaction.overdue_warning_sent_at + timezone.timedelta(hours=OVERDUE_WARNING_HOURS)
            notifications.append(
                {
                    "id": f"overdue-{transaction.id}",
                    "type": "overdue_warning",
                    "severity": "danger",
                    "message": OVERDUE_WARNING_MESSAGE,
                    "listing_title": transaction.listing.title,
                    "transaction_id": transaction.id,
                    "warning_sent_at": transaction.overdue_warning_sent_at,
                    "deadline": deadline,
                    "created_at": transaction.overdue_warning_sent_at or transaction.updated_at,
                }
            )

        if request.user.suspension_is_active():
            notifications.insert(
                0,
                {
                    "id": "account-suspended",
                    "type": "suspension",
                    "severity": "danger",
                    "message": request.user.suspension_reason or "Your account is suspended.",
                    "suspension_until": request.user.suspension_until,
                    "created_at": request.user.suspended_at,
                },
            )

        return Response(notifications, status=status.HTTP_200_OK)


class TransactionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TransactionCreateSerializer
        return TransactionSerializer

    def get_queryset(self):
        queryset = transaction_queryset().filter(
            Q(requester=self.request.user) | Q(seller=self.request.user)
        )
        return filter_transaction_queryset(queryset, self.request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transaction = serializer.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction, status_code=status.HTTP_201_CREATED)


class MySentTransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = transaction_queryset().filter(requester=self.request.user)
        return filter_transaction_queryset(queryset, self.request)


class MyReceivedTransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = transaction_queryset().filter(seller=self.request.user)
        return filter_transaction_queryset(queryset, self.request)


class TransactionDetailView(generics.RetrieveAPIView):
    queryset = transaction_queryset()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, IsTransactionParticipant]


class TransactionActionMixin:
    serializer_class = None

    def get_transaction(self, pk):
        refresh_overdue_transactions()
        return get_object_or_404(transaction_queryset(), pk=pk)

    def get_serializer(self, *args, **kwargs):
        return self.serializer_class(*args, **kwargs)


class TransactionAcceptView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionDecisionSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.status != Transaction.Status.PENDING:
            raise ValidationError("Only pending requests can be accepted.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction.status = Transaction.Status.ACCEPTED
        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionRejectView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionDecisionSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.status not in {
            Transaction.Status.PENDING,
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
        }:
            raise ValidationError("This request can no longer be rejected.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction.status = Transaction.Status.REJECTED
        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionCancelView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionDecisionSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, requester_only=True)
        if transaction.status not in {
            Transaction.Status.PENDING,
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
        }:
            raise ValidationError("This request can no longer be cancelled.")

        transaction.status = Transaction.Status.CANCELLED
        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionMeetingView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionMeetingSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction)
        if transaction.status in {
            Transaction.Status.REJECTED,
            Transaction.Status.CANCELLED,
            Transaction.Status.COMPLETED,
            Transaction.Status.SOLD,
            Transaction.Status.RETURNED,
        }:
            raise ValidationError("Meetings cannot be updated for a closed transaction.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        meeting_changed = False
        if "meeting_location" in serializer.validated_data and "meeting_datetime" in serializer.validated_data:
            previous_location = transaction.meeting_location
            previous_datetime = transaction.meeting_datetime
            transaction.meeting_location = serializer.validated_data["meeting_location"]
            transaction.meeting_datetime = serializer.validated_data["meeting_datetime"]
            meeting_changed = (
                previous_location != transaction.meeting_location
                or previous_datetime != transaction.meeting_datetime
            )

        explicit_meeting_status = serializer.validated_data.get("meeting_status")
        if explicit_meeting_status:
            transaction.meeting_status = explicit_meeting_status
        elif meeting_changed:
            transaction.meeting_status = (
                Transaction.MeetingStatus.RESCHEDULED
                if previous_location or previous_datetime
                else Transaction.MeetingStatus.PROPOSED
            )

        if request.user.id == transaction.seller_id and "seller_note" in serializer.validated_data:
            transaction.seller_note = serializer.validated_data["seller_note"]
        if request.user.id == transaction.requester_id and "buyer_note" in serializer.validated_data:
            transaction.buyer_note = serializer.validated_data["buyer_note"]
        if request.user.is_staff or request.user.is_superuser:
            if "seller_note" in serializer.validated_data:
                transaction.seller_note = serializer.validated_data["seller_note"]
            if "buyer_note" in serializer.validated_data:
                transaction.buyer_note = serializer.validated_data["buyer_note"]

        if transaction.status != Transaction.Status.PENDING and transaction.meeting_location and transaction.meeting_datetime:
            transaction.status = Transaction.Status.MEETING_SCHEDULED

        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionHandOverView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionCompleteSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.status not in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            raise ValidationError("This transaction is not ready for handover.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.meeting_status = Transaction.MeetingStatus.COMPLETED

        if transaction.transaction_type == Transaction.Type.LOAN:
            transaction.status = Transaction.Status.ACTIVE_LOAN
        else:
            transaction.status = Transaction.Status.HANDED_OVER

        transaction.save()

        if transaction.transaction_type == Transaction.Type.LOAN:
            close_competing_transactions(transaction)
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionReturnView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionReturnSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.transaction_type != Transaction.Type.LOAN:
            raise ValidationError("Only loan transactions can be returned.")
        if transaction.status not in {Transaction.Status.ACTIVE_LOAN, Transaction.Status.OVERDUE}:
            raise ValidationError("Only active or overdue loans can be returned.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction.actual_return_date = serializer.validated_data.get("actual_return_date") or transaction.actual_return_date
        if not transaction.actual_return_date:
            transaction.actual_return_date = transaction.expected_return_date or transaction.created_at.date()
        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.status = Transaction.Status.RETURNED
        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionMarkSoldView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionCompleteSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.transaction_type != Transaction.Type.SALE:
            raise ValidationError("Only sale transactions can be marked as sold.")
        if transaction.status not in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            raise ValidationError("This transaction is not ready to be marked as sold.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.status = Transaction.Status.SOLD
        transaction.meeting_status = Transaction.MeetingStatus.COMPLETED
        transaction.save()
        close_competing_transactions(transaction)
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class TransactionCompleteView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionCompleteSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        ensure_transaction_access(request, transaction, seller_only=True)
        if transaction.transaction_type not in {Transaction.Type.EXCHANGE, Transaction.Type.DONATE}:
            raise ValidationError("Only exchange and donation transactions can be completed here.")
        if transaction.status not in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            raise ValidationError("This transaction is not ready to be completed.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get("seller_note"):
            transaction.seller_note = serializer.validated_data["seller_note"]
        transaction.status = Transaction.Status.COMPLETED
        transaction.meeting_status = Transaction.MeetingStatus.COMPLETED
        transaction.save()
        close_competing_transactions(transaction)
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class AdminTransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_queryset(self):
        return filter_transaction_queryset(transaction_queryset(), self.request)


class AdminOverdueTransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_queryset(self):
        queryset = transaction_queryset().filter(
            transaction_type=Transaction.Type.LOAN,
            status=Transaction.Status.OVERDUE,
        )
        return filter_transaction_queryset(queryset, self.request)


class AdminTransactionResolveView(TransactionActionMixin, APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    serializer_class = AdminTransactionResolveSerializer

    def post(self, request, pk):
        transaction = self.get_transaction(pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction.resolution_note = serializer.validated_data["resolution_note"]
        transaction.resolved_by = request.user
        transaction.resolved_at = timezone.now()

        next_status = serializer.validated_data.get("status")
        if next_status:
            if next_status == Transaction.Status.RETURNED:
                transaction.actual_return_date = (
                    serializer.validated_data.get("actual_return_date")
                    or transaction.actual_return_date
                    or transaction.expected_return_date
                )
            transaction.status = next_status

        if serializer.validated_data.get("actual_return_date"):
            transaction.actual_return_date = serializer.validated_data["actual_return_date"]

        transaction.save()
        sync_listing_status(transaction.listing)
        return serialize_transaction(request, transaction)


class AdminApplyOverdueSuspensionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        suspended_users = apply_overdue_suspensions()
        suspended_count = suspended_users.count()
        return Response(
            {
                "detail": f"{suspended_count} overdue user suspension(s) applied.",
                "suspended_count": suspended_count,
                "suspended_user_ids": list(suspended_users.values_list("id", flat=True)),
            },
            status=status.HTTP_200_OK,
        )


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
            "reporter",
            "listing",
            "reported_user",
        )
