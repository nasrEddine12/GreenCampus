from rest_framework import serializers

from .models import Category, Favorite, Listing, Report, Review, Transaction


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "eco_focus", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class ListingSerializer(serializers.ModelSerializer):
    seller_email = serializers.EmailField(source="seller.email", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id",
            "seller",
            "seller_email",
            "category",
            "category_name",
            "title",
            "description",
            "condition",
            "price",
            "eco_score",
            "is_available",
            "is_favorited",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "seller", "seller_email", "is_favorited", "created_at", "updated_at"]

    def get_is_favorited(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.favorites.filter(user=user).exists()


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
