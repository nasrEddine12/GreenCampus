from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from .models import (
    OVERDUE_WARNING_HOURS,
    SUSPENDED_MARKETPLACE_ACTION_MESSAGE,
    Category,
    ContactMessage,
    Favorite,
    Listing,
    Report,
    Review,
    Transaction,
)


ALLOWED_LISTING_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_LISTING_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def _display_name(user):
    if not user:
        return ""
    return user.username or user.email


def transaction_available_actions(transaction, user):
    if not user or not user.is_authenticated:
        return []

    is_admin = bool(user.is_staff or user.is_superuser)
    is_seller = transaction.seller_id == user.id
    is_requester = transaction.requester_id == user.id

    if not (is_admin or is_seller or is_requester):
        return []

    actions = []
    final_statuses = {
        Transaction.Status.REJECTED,
        Transaction.Status.CANCELLED,
        Transaction.Status.COMPLETED,
        Transaction.Status.SOLD,
        Transaction.Status.RETURNED,
    }

    if transaction.status not in final_statuses:
        actions.append("meeting")

    if is_seller or is_admin:
        if transaction.status == Transaction.Status.PENDING:
            actions.extend(["accept", "reject"])

        if transaction.transaction_type == Transaction.Type.LOAN and transaction.status in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            actions.append("handover")

        if transaction.transaction_type == Transaction.Type.LOAN and transaction.status in {
            Transaction.Status.ACTIVE_LOAN,
            Transaction.Status.OVERDUE,
        }:
            actions.append("return")

        if transaction.transaction_type == Transaction.Type.SALE and transaction.status in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            actions.append("sold")

        if transaction.transaction_type in {Transaction.Type.EXCHANGE, Transaction.Type.DONATE} and transaction.status in {
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
        }:
            actions.append("complete")

    if is_requester and transaction.status in {
        Transaction.Status.PENDING,
        Transaction.Status.ACCEPTED,
        Transaction.Status.MEETING_SCHEDULED,
    }:
        actions.append("cancel")

    if is_admin:
        actions.append("resolve")

    return actions


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "eco_focus", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class ListingSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)
    image_url = serializers.SerializerMethodField()
    image_width = serializers.SerializerMethodField()
    image_height = serializers.SerializerMethodField()
    listing_type_display = serializers.CharField(source="get_listing_type_display", read_only=True)
    condition_display = serializers.CharField(source="get_condition_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id",
            "seller",
            "seller_name",
            "category",
            "category_name",
            "title",
            "description",
            "image",
            "image_url",
            "image_width",
            "image_height",
            "listing_type",
            "listing_type_display",
            "campus",
            "condition",
            "condition_display",
            "price",
            "eco_score",
            "status",
            "status_display",
            "is_available",
            "created_at",
            "updated_at",
            "is_owner",
        ]
        read_only_fields = [
            "id",
            "seller",
            "seller_name",
            "category_name",
            "image_url",
            "image_width",
            "image_height",
            "listing_type_display",
            "condition_display",
            "status_display",
            "created_at",
            "updated_at",
            "is_owner",
        ]

    def get_seller_name(self, obj):
        return _display_name(obj.seller)

    def get_is_owner(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.seller_id == request.user.id)

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image:
            url = obj.image.url
            return request.build_absolute_uri(url) if request else url
        if obj.image_url:
            return obj.image_url
        return ""

    def get_image_width(self, obj):
        try:
            return obj.image.width if obj.image else None
        except Exception:
            return None

    def get_image_height(self, obj):
        try:
            return obj.image.height if obj.image else None
        except Exception:
            return None

    def validate_image(self, value):
        if not value:
            return value

        content_type = getattr(value, "content_type", "")
        name = getattr(value, "name", "").lower()
        if content_type not in ALLOWED_LISTING_IMAGE_TYPES or not name.endswith(ALLOWED_LISTING_IMAGE_EXTENSIONS):
            raise serializers.ValidationError("Upload a JPG, JPEG, PNG, or WEBP image.")
        return value

    def validate(self, attrs):
        image = attrs.get("image")
        if self.instance is None and not image:
            raise serializers.ValidationError({"image": "A listing photo is required."})
        return attrs


class ContactMessageSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(
        source="listing",
        queryset=Listing.objects.all(),
        write_only=True,
    )
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    sender_name = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "listing",
            "listing_id",
            "listing_title",
            "sender",
            "sender_name",
            "recipient",
            "recipient_name",
            "message",
            "reply",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "listing",
            "listing_title",
            "sender",
            "sender_name",
            "recipient",
            "recipient_name",
            "reply",
            "status",
            "created_at",
            "updated_at",
        ]

    def get_sender_name(self, obj):
        return _display_name(obj.sender)

    def get_recipient_name(self, obj):
        return _display_name(obj.recipient)

    def validate(self, attrs):
        request = self.context["request"]
        listing = attrs["listing"]

        if request.user.suspension_is_active():
            raise serializers.ValidationError(SUSPENDED_MARKETPLACE_ACTION_MESSAGE)

        if not request.user.can_contact:
            raise serializers.ValidationError("Your account cannot send contact messages right now.")

        if listing.seller_id == request.user.id:
            raise serializers.ValidationError("You cannot contact yourself about your own listing.")

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        listing = validated_data["listing"]
        return ContactMessage.objects.create(
            listing=listing,
            sender=request.user,
            recipient=listing.seller,
            message=validated_data["message"],
        )


class ContactMessageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["status", "reply"]

    def validate(self, attrs):
        request = self.context["request"]
        message = self.instance

        if request.user.id != message.recipient_id and not request.user.is_staff:
            raise serializers.ValidationError("Only the recipient can update this message.")

        reply = attrs.get("reply")
        if reply:
            attrs["status"] = ContactMessage.Status.REPLIED
        return attrs


class FavoriteSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(
        source="listing",
        queryset=Listing.objects.all(),
        write_only=True,
    )
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    listing_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Favorite
        fields = ["id", "user", "listing", "listing_id", "listing_title", "listing_image_url", "created_at"]
        read_only_fields = ["id", "user", "listing", "listing_title", "listing_image_url", "created_at"]

    def get_listing_image_url(self, obj):
        request = self.context.get("request")
        if obj.listing.image:
            url = obj.listing.image.url
            return request.build_absolute_uri(url) if request else url
        return obj.listing.image_url or ""

    def create(self, validated_data):
        favorite, _ = Favorite.objects.get_or_create(
            user=self.context["request"].user,
            listing=validated_data["listing"],
        )
        return favorite


class TransactionSerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    listing_image_url = serializers.SerializerMethodField()
    listing_status = serializers.CharField(source="listing.status", read_only=True)
    listing_status_display = serializers.CharField(source="listing.get_status_display", read_only=True)
    seller_name = serializers.SerializerMethodField()
    requester_name = serializers.SerializerMethodField()
    requester_overdue_count = serializers.IntegerField(source="requester.overdue_count", read_only=True)
    transaction_type_display = serializers.CharField(source="get_transaction_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    meeting_status_display = serializers.CharField(source="get_meeting_status_display", read_only=True)
    is_overdue = serializers.SerializerMethodField()
    overdue_warning_deadline = serializers.SerializerMethodField()
    available_actions = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    is_seller = serializers.SerializerMethodField()
    is_requester = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            "id",
            "listing",
            "listing_title",
            "listing_image_url",
            "listing_status",
            "listing_status_display",
            "seller",
            "seller_name",
            "requester",
            "requester_name",
            "requester_overdue_count",
            "transaction_type",
            "transaction_type_display",
            "status",
            "status_display",
            "price",
            "message",
            "requested_start_date",
            "expected_return_date",
            "actual_return_date",
            "meeting_location",
            "meeting_datetime",
            "meeting_status",
            "meeting_status_display",
            "seller_note",
            "buyer_note",
            "overdue_warning_sent_at",
            "overdue_warning_deadline",
            "was_ever_overdue",
            "is_overdue",
            "available_actions",
            "resolution_note",
            "resolved_at",
            "resolved_by",
            "resolved_by_name",
            "created_at",
            "updated_at",
            "is_seller",
            "is_requester",
        ]
        read_only_fields = fields

    def get_listing_image_url(self, obj):
        request = self.context.get("request")
        if obj.listing.image:
            url = obj.listing.image.url
            return request.build_absolute_uri(url) if request else url
        return obj.listing.image_url or ""

    def get_seller_name(self, obj):
        return _display_name(obj.seller)

    def get_requester_name(self, obj):
        return _display_name(obj.requester)

    def get_is_overdue(self, obj):
        return obj.is_overdue()

    def get_overdue_warning_deadline(self, obj):
        if not obj.overdue_warning_sent_at:
            return None
        return obj.overdue_warning_sent_at + timezone.timedelta(hours=OVERDUE_WARNING_HOURS)

    def get_available_actions(self, obj):
        request = self.context.get("request")
        return transaction_available_actions(obj, request.user if request else None)

    def get_resolved_by_name(self, obj):
        return _display_name(obj.resolved_by)

    def get_is_seller(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.seller_id == request.user.id)

    def get_is_requester(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.requester_id == request.user.id)


class TransactionCreateSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(source="listing", queryset=Listing.objects.all(), write_only=True)
    meeting_datetime = serializers.DateTimeField(required=False, allow_null=True)
    requested_start_date = serializers.DateField(required=False, allow_null=True)
    expected_return_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "listing_id",
            "message",
            "meeting_location",
            "meeting_datetime",
            "requested_start_date",
            "expected_return_date",
            "price",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        request = self.context["request"]
        listing = attrs["listing"]

        if request.user.suspension_is_active():
            raise serializers.ValidationError(SUSPENDED_MARKETPLACE_ACTION_MESSAGE)

        if not request.user.can_contact:
            raise serializers.ValidationError("Your account cannot create requests right now.")

        if listing.seller_id == request.user.id:
            raise serializers.ValidationError("You cannot request your own listing.")

        if listing.status != Listing.Status.AVAILABLE or not listing.is_available:
            raise serializers.ValidationError("This listing is not available for a new transaction.")

        active_statuses = [
            Transaction.Status.PENDING,
            Transaction.Status.ACCEPTED,
            Transaction.Status.MEETING_SCHEDULED,
            Transaction.Status.HANDED_OVER,
            Transaction.Status.ACTIVE_LOAN,
            Transaction.Status.OVERDUE,
        ]
        if Transaction.objects.filter(
            listing=listing,
            requester=request.user,
            status__in=active_statuses,
        ).exists():
            raise serializers.ValidationError("You already have an active request for this listing.")

        start_date = attrs.get("requested_start_date")
        return_date = attrs.get("expected_return_date")

        if listing.listing_type == Listing.Type.LOAN:
            if not start_date or not return_date:
                raise serializers.ValidationError(
                    {
                        "requested_start_date": "Loan requests need a start date and a return date.",
                        "expected_return_date": "Loan requests need a start date and a return date.",
                    }
                )
        else:
            attrs["requested_start_date"] = None
            attrs["expected_return_date"] = None

        if listing.listing_type in {Listing.Type.DONATE, Listing.Type.EXCHANGE}:
            attrs["price"] = Decimal("0")
        elif attrs.get("price") in (None, Decimal("0")):
            attrs["price"] = listing.price

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        listing = validated_data.pop("listing")
        return Transaction.objects.create(
            listing=listing,
            requester=request.user,
            seller=listing.seller,
            transaction_type=listing.listing_type,
            **validated_data,
        )


class TransactionDecisionSerializer(serializers.Serializer):
    seller_note = serializers.CharField(required=False, allow_blank=True)


class TransactionMeetingSerializer(serializers.Serializer):
    meeting_location = serializers.CharField(max_length=255, required=False, allow_blank=True)
    meeting_datetime = serializers.DateTimeField(required=False, allow_null=True)
    meeting_status = serializers.ChoiceField(
        choices=Transaction.MeetingStatus.choices,
        required=False,
    )
    seller_note = serializers.CharField(required=False, allow_blank=True)
    buyer_note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if ("meeting_location" in attrs) ^ ("meeting_datetime" in attrs):
            raise serializers.ValidationError("Meeting date/time and location must be updated together.")
        return attrs


class TransactionReturnSerializer(serializers.Serializer):
    actual_return_date = serializers.DateField(required=False)
    seller_note = serializers.CharField(required=False, allow_blank=True)

    def validate_actual_return_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Return date cannot be in the future.")
        return value


class TransactionCompleteSerializer(serializers.Serializer):
    seller_note = serializers.CharField(required=False, allow_blank=True)


class AdminTransactionResolveSerializer(serializers.Serializer):
    resolution_note = serializers.CharField(required=True, allow_blank=False)
    status = serializers.ChoiceField(choices=Transaction.Status.choices, required=False)
    actual_return_date = serializers.DateField(required=False)


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.SerializerMethodField()
    reviewed_user_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            "id",
            "transaction",
            "reviewer",
            "reviewer_name",
            "reviewed_user",
            "reviewed_user_name",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "reviewer", "reviewer_name", "created_at"]

    def get_reviewer_name(self, obj):
        return _display_name(obj.reviewer)

    def get_reviewed_user_name(self, obj):
        return _display_name(obj.reviewed_user)

    def create(self, validated_data):
        validated_data["reviewer"] = self.context["request"].user
        return super().create(validated_data)


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ["id", "reporter", "listing", "reported_user", "reason", "status", "created_at"]
        read_only_fields = ["id", "reporter", "status", "created_at"]

    def create(self, validated_data):
        validated_data["reporter"] = self.context["request"].user
        return super().create(validated_data)
