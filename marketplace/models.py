from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    eco_focus = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug_candidate = base_slug
            suffix = 1
            while Category.objects.exclude(pk=self.pk).filter(slug=slug_candidate).exists():
                suffix += 1
                slug_candidate = f"{base_slug}-{suffix}"
            self.slug = slug_candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Listing(models.Model):
    class Condition(models.TextChoices):
        NEW = "new", "New"
        LIKE_NEW = "like_new", "Like New"
        GOOD = "good", "Good"
        FAIR = "fair", "Fair"

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="listings",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name="listings",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=180)
    description = models.TextField()
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.GOOD)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    eco_score = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Favorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    listing = models.ForeignKey(
        Listing,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "listing"], name="uniq_favorite_user_listing")
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} -> {self.listing}"


class Transaction(models.Model):
    class Type(models.TextChoices):
        SALE = "sale", "Sale"
        LOAN = "loan", "Loan"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    listing = models.ForeignKey(
        Listing,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    borrower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="borrowed_transactions",
    )
    lender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lent_transactions",
    )
    transaction_type = models.CharField(max_length=10, choices=Type.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    loan_start = models.DateField(null=True, blank=True)
    loan_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        errors = {}

        if self.borrower_id and self.lender_id and self.borrower_id == self.lender_id:
            errors["borrower"] = "Borrower and lender must be different users."

        if self.listing_id and self.lender_id and self.listing.seller_id != self.lender_id:
            errors["lender"] = "Lender must be the listing owner."

        if self.transaction_type == self.Type.LOAN and not self.loan_end:
            errors["loan_end"] = "Loan end date is required for loan transactions."

        if self.transaction_type == self.Type.SALE and (self.loan_start or self.loan_end):
            errors["loan_end"] = "Loan dates are only allowed for loan transactions."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.amount in (None, 0):
            self.amount = self.listing.price
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.listing} ({self.transaction_type})"


class Review(models.Model):
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="given_reviews",
    )
    reviewed_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_reviews",
    )
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["transaction", "reviewer"], name="uniq_review_transaction_reviewer")
        ]
        ordering = ["-created_at"]

    def clean(self):
        if self.reviewer_id == self.reviewed_user_id:
            raise ValidationError({"reviewed_user": "You cannot review yourself."})

        if self.transaction_id:
            participants = {self.transaction.borrower_id, self.transaction.lender_id}
            if self.reviewer_id not in participants:
                raise ValidationError({"reviewer": "Reviewer must be part of the transaction."})
            if self.reviewed_user_id not in participants:
                raise ValidationError({"reviewed_user": "Reviewed user must be part of the transaction."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Review {self.rating}/5"


class Report(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        REJECTED = "rejected", "Rejected"

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports",
    )
    listing = models.ForeignKey(
        Listing,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reported_cases",
    )
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if not self.listing_id and not self.reported_user_id:
            raise ValidationError("A report must target a listing or a user.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Report #{self.pk}"
