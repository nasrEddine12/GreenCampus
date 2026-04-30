from rest_framework import serializers

from .models import Category, ContactMessage, Favorite, Listing, Report, Review, Transaction


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "eco_focus", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class ListingSerializer(serializers.ModelSerializer):
    seller_name = serializers.CharField(source="seller.username", read_only=True)
    seller_email = serializers.EmailField(source="seller.email", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    image = serializers.ImageField(required=False, allow_empty_file=False, write_only=True)
    image_url = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    allowed_image_extensions = {"jpg", "jpeg", "png", "webp"}

    class Meta:
        model = Listing
        fields = [
            "id",
            "seller",
            "seller_name",
            "seller_email",
            "category",
            "category_name",
            "title",
            "description",
            "image",
            "image_url",
            "campus",
            "condition",
            "price",
            "eco_score",
            "is_available",
            "is_favorited",
            "is_owner",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "seller",
            "seller_name",
            "seller_email",
            "image_url",
            "is_favorited",
            "is_owner",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image:
            url = obj.image.url
            return request.build_absolute_uri(url) if request else url
        return obj.image_url

    def validate_image(self, value):
        extension = value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""
        if extension not in self.allowed_image_extensions:
            raise serializers.ValidationError("Upload a JPG, JPEG, PNG, or WEBP image.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if request and request.method == "POST" and not attrs.get("image"):
            raise serializers.ValidationError({"image": "A listing image is required."})
        return attrs

    def get_is_favorited(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.favorites.filter(user=user).exists()

    def get_is_owner(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.seller_id == user.id)


class FavoriteSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(
        source="listing",
        queryset=Listing.objects.all(),
        write_only=True,
    )
    listing = ListingSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ["id", "listing", "listing_id", "created_at"]
        read_only_fields = ["id", "listing", "created_at"]

    def create(self, validated_data):
        favorite, _ = Favorite.objects.get_or_create(
            user=self.context["request"].user,
            listing=validated_data["listing"],
        )
        return favorite


class ContactMessageSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(
        source="listing",
        queryset=Listing.objects.select_related("seller").all(),
        write_only=True,
    )
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    listing_image_url = serializers.SerializerMethodField()
    sender_name = serializers.CharField(source="sender.username", read_only=True)
    recipient_name = serializers.CharField(source="recipient.username", read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "listing",
            "listing_id",
            "listing_title",
            "listing_image_url",
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
            "listing_image_url",
            "sender",
            "sender_name",
            "recipient",
            "recipient_name",
            "reply",
            "status",
            "created_at",
            "updated_at",
        ]

    def get_listing_image_url(self, obj):
        request = self.context.get("request")
        if obj.listing.image:
            url = obj.listing.image.url
            return request.build_absolute_uri(url) if request else url
        return obj.listing.image_url

    def validate(self, attrs):
        listing = attrs["listing"]
        request = self.context["request"]

        if listing.seller_id == request.user.id:
            raise serializers.ValidationError({"detail": "You cannot contact yourself about your own listing."})

        if not listing.is_available:
            raise serializers.ValidationError({"detail": "This listing is not available for contact."})

        return attrs

    def create(self, validated_data):
        listing = validated_data["listing"]
        return ContactMessage.objects.create(
            listing=listing,
            sender=self.context["request"].user,
            recipient=listing.seller,
            message=validated_data["message"],
        )


class ContactMessageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["status", "reply"]

    def validate_status(self, value):
        if value not in {ContactMessage.Status.READ, ContactMessage.Status.REPLIED}:
            raise serializers.ValidationError("Status can only be changed to read or replied.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        if self.instance.recipient_id != request.user.id and not request.user.is_staff:
            raise serializers.ValidationError({"detail": "Only the seller can update this contact request."})

        if attrs.get("reply") and attrs.get("status") != ContactMessage.Status.REPLIED:
            attrs["status"] = ContactMessage.Status.REPLIED

        return attrs


class TransactionSerializer(serializers.ModelSerializer):
    listing_id = serializers.PrimaryKeyRelatedField(source="listing", queryset=Listing.objects.all(), write_only=True)
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    borrower_email = serializers.EmailField(source="borrower.email", read_only=True)
    lender_email = serializers.EmailField(source="lender.email", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "listing",
            "listing_id",
            "listing_title",
            "borrower",
            "borrower_email",
            "lender",
            "lender_email",
            "transaction_type",
            "status",
            "amount",
            "loan_start",
            "loan_end",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "listing",
            "listing_title",
            "borrower",
            "borrower_email",
            "lender",
            "lender_email",
            "amount",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        request = self.context["request"]
        listing = attrs.get("listing")
        if listing is None and self.instance is not None:
            listing = self.instance.listing

        if listing and request.method == "POST" and listing.seller_id == request.user.id:
            raise serializers.ValidationError({"detail": "You cannot create a transaction for your own listing."})

        transaction_type = attrs.get("transaction_type")
        if transaction_type is None and self.instance is not None:
            transaction_type = self.instance.transaction_type

        loan_end = attrs.get("loan_end")
        if loan_end is None and self.instance is not None:
            loan_end = self.instance.loan_end

        if transaction_type == Transaction.Type.LOAN and not loan_end:
            raise serializers.ValidationError({"loan_end": "Loan end date is required for loan transactions."})

        return attrs

    def create(self, validated_data):
        listing = validated_data["listing"]
        return Transaction.objects.create(
            listing=listing,
            borrower=self.context["request"].user,
            lender=listing.seller,
            amount=listing.price,
            transaction_type=validated_data["transaction_type"],
            loan_start=validated_data.get("loan_start"),
            loan_end=validated_data.get("loan_end"),
        )


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_email = serializers.EmailField(source="reviewer.email", read_only=True)
    reviewed_user_email = serializers.EmailField(source="reviewed_user.email", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "transaction",
            "reviewer",
            "reviewer_email",
            "reviewed_user",
            "reviewed_user_email",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "reviewer", "reviewer_email", "reviewed_user_email", "created_at"]

    def validate(self, attrs):
        transaction = attrs["transaction"]
        reviewer = self.context["request"].user
        reviewed_user = attrs["reviewed_user"]

        participants = {transaction.borrower_id, transaction.lender_id}
        if reviewer.id not in participants:
            raise serializers.ValidationError({"detail": "Only transaction participants can post a review."})

        if reviewed_user.id not in participants:
            raise serializers.ValidationError(
                {"reviewed_user": "Reviewed user must be part of the selected transaction."}
            )

        if transaction.status != Transaction.Status.DONE:
            raise serializers.ValidationError({"detail": "Reviews are allowed only after a transaction is done."})

        return attrs

    def create(self, validated_data):
        return Review.objects.create(reviewer=self.context["request"].user, **validated_data)


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = [
            "id",
            "reporter",
            "listing",
            "reported_user",
            "reason",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "reporter", "status", "created_at"]

    def create(self, validated_data):
        return Report.objects.create(reporter=self.context["request"].user, **validated_data)
