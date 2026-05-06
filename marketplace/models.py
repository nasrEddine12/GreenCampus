from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Count
from django.utils import timezone
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
    class Type(models.TextChoices):
        SALE = "sale", "Sell"
        LOAN = "loan", "Loan / Rent"
        EXCHANGE = "exchange", "Exchange"
        DONATE = "donate", "Donate"

    class Condition(models.TextChoices):
        NEW = "new", "New"
        LIKE_NEW = "like_new", "Like New"
        GOOD = "good", "Good"
        FAIR = "fair", "Fair"

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        RESERVED = "reserved", "Reserved"
        SOLD = "sold", "Sold"
        LOANED = "loaned", "Loaned"
        EXCHANGED = "exchanged", "Exchanged"
        DONATED = "donated", "Donated"
        HIDDEN = "hidden", "Hidden"

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
    image = models.ImageField(upload_to="listings/", blank=True, default="")
    image_url = models.URLField(max_length=500, blank=True, default="")
    listing_type = models.CharField(max_length=12, choices=Type.choices, default=Type.SALE)
    campus = models.CharField(max_length=120, blank=True, default="")
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.GOOD)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    eco_score = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.is_available and self.status == self.Status.HIDDEN:
            self.status = self.Status.AVAILABLE
        elif self.status == self.Status.AVAILABLE:
            self.is_available = True
        elif self.status in {
            self.Status.RESERVED,
            self.Status.SOLD,
            self.Status.LOANED,
            self.Status.EXCHANGED,
            self.Status.DONATED,
            self.Status.HIDDEN,
        }:
            self.is_available = False
        elif not self.is_available:
            self.status = self.Status.HIDDEN
        super().save(*args, **kwargs)


class ContactMessage(models.Model):
    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        READ = "read", "Read"
        REPLIED = "replied", "Replied"

    listing = models.ForeignKey(
        Listing,
        on_delete=models.CASCADE,
        related_name="contact_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_contact_messages",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_contact_messages",
    )
    message = models.TextField()
    reply = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SENT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if self.sender_id and self.recipient_id and self.sender_id == self.recipient_id:
            raise ValidationError({"listing": "You cannot contact yourself about your own listing."})

        if self.listing_id and self.recipient_id and self.listing.seller_id != self.recipient_id:
            raise ValidationError({"recipient": "Contact recipient must be the listing seller."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.sender} -> {self.recipient} about {self.listing}"


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
        LOAN = "loan", "Loan / Rent"
        EXCHANGE = "exchange", "Exchange"
        DONATE = "donate", "Donate"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        MEETING_SCHEDULED = "meeting_scheduled", "Meeting Scheduled"
        HANDED_OVER = "handed_over", "Item Handed Over"
        ACTIVE_LOAN = "active_loan", "Active Loan"
        COMPLETED = "completed", "Completed"
        SOLD = "sold", "Sold"
        RETURNED = "returned", "Returned"
        OVERDUE = "overdue", "Overdue"

    class MeetingStatus(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        RESCHEDULED = "rescheduled", "Rescheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    listing = models.ForeignKey(
        Listing,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_transactions",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="seller_transactions",
    )
    transaction_type = models.CharField(max_length=12, choices=Type.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)], default=0)
    message = models.TextField(blank=True)
    requested_start_date = models.DateField(null=True, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)
    actual_return_date = models.DateField(null=True, blank=True)
    meeting_location = models.CharField(max_length=255, blank=True)
    meeting_datetime = models.DateTimeField(null=True, blank=True)
    meeting_status = models.CharField(
        max_length=12,
        choices=MeetingStatus.choices,
        default=MeetingStatus.PROPOSED,
    )
    seller_note = models.TextField(blank=True)
    buyer_note = models.TextField(blank=True)
    overdue_warning_sent_at = models.DateTimeField(null=True, blank=True)
    was_ever_overdue = models.BooleanField(default=False)
    resolution_note = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="resolved_transactions",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_finalized(self):
        return self.status in {
            self.Status.REJECTED,
            self.Status.CANCELLED,
            self.Status.COMPLETED,
            self.Status.SOLD,
            self.Status.RETURNED,
        }

    def is_overdue(self, today=None):
        today = today or timezone.localdate()
        return (
            self.transaction_type == self.Type.LOAN
            and self.status in {self.Status.ACTIVE_LOAN, self.Status.OVERDUE}
            and self.expected_return_date is not None
            and self.expected_return_date < today
            and self.actual_return_date is None
        )

    def clean(self):
        errors = {}

        if self.requester_id and self.seller_id and self.requester_id == self.seller_id:
            errors["requester"] = "Requester and seller must be different users."

        if self.listing_id and self.seller_id and self.listing.seller_id != self.seller_id:
            errors["seller"] = "Seller must be the listing owner."

        if self.listing_id and self.transaction_type and self.listing.listing_type != self.transaction_type:
            errors["transaction_type"] = "Transaction type must match the listing type."

        if bool(self.meeting_datetime) != bool(self.meeting_location):
            errors["meeting_location"] = "Meeting date/time and location must be provided together."

        if self.transaction_type == self.Type.LOAN:
            if not self.expected_return_date:
                errors["expected_return_date"] = "Return date is required for loan transactions."
            if not self.requested_start_date:
                errors["requested_start_date"] = "Start date is required for loan transactions."
            if self.requested_start_date and self.expected_return_date and self.expected_return_date < self.requested_start_date:
                errors["expected_return_date"] = "Return date must be after the requested start date."
        elif self.requested_start_date or self.expected_return_date or self.actual_return_date:
            errors["requested_start_date"] = "Loan dates are only allowed for loan transactions."

        if self.transaction_type in {self.Type.DONATE, self.Type.EXCHANGE} and self.price not in {None, Decimal("0"), 0}:
            errors["price"] = "Only sale and loan transactions can carry a price."

        if self.status == self.Status.ACTIVE_LOAN and self.transaction_type != self.Type.LOAN:
            errors["status"] = "Only loan transactions can become active loans."

        if self.status == self.Status.RETURNED and self.transaction_type != self.Type.LOAN:
            errors["status"] = "Only loan transactions can be returned."

        if self.actual_return_date and self.transaction_type != self.Type.LOAN:
            errors["actual_return_date"] = "Only loan transactions can record a return date."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.transaction_type in {self.Type.SALE, self.Type.LOAN} and self.price in (None, 0, Decimal("0")):
            self.price = self.listing.price
        elif self.transaction_type in {self.Type.DONATE, self.Type.EXCHANGE}:
            self.price = Decimal("0")

        if self.actual_return_date and self.transaction_type == self.Type.LOAN:
            self.status = self.Status.RETURNED

        if self.is_overdue():
            self.status = self.Status.OVERDUE
            self.was_ever_overdue = True

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.listing} ({self.transaction_type})"


def sync_user_overdue_counts(user_ids=None):
    User = get_user_model()
    queryset = User.objects.all()
    if user_ids is not None:
        ids = {user_id for user_id in user_ids if user_id}
        if not ids:
            return
        queryset = queryset.filter(id__in=ids)

    overdue_totals = dict(
        Transaction.objects.filter(was_ever_overdue=True)
        .values("requester_id")
        .annotate(total=Count("id"))
        .values_list("requester_id", "total")
    )

    for user in queryset.only("id", "overdue_count"):
        total = overdue_totals.get(user.id, 0)
        if user.overdue_count != total:
            User.objects.filter(pk=user.pk).update(overdue_count=total)


OVERDUE_WARNING_HOURS = 24
OVERDUE_SUSPENSION_DAYS = 7
OVERDUE_WARNING_MESSAGE = (
    "You have an overdue item. Please return it within 24 hours or your account will be suspended for 1 week."
)


def refresh_overdue_transactions(today=None, now=None):
    today = today or timezone.localdate()
    now = now or timezone.now()
    overdue_transactions = Transaction.objects.select_related("listing").filter(
        transaction_type=Transaction.Type.LOAN,
        expected_return_date__lt=today,
        actual_return_date__isnull=True,
        status__in=[Transaction.Status.ACTIVE_LOAN, Transaction.Status.OVERDUE],
    )

    touched_requesters = set()
    refreshed = []

    for transaction in overdue_transactions:
        changed = False

        if transaction.status != Transaction.Status.OVERDUE:
            transaction.status = Transaction.Status.OVERDUE
            changed = True

        if not transaction.was_ever_overdue:
            transaction.was_ever_overdue = True
            changed = True

        if not transaction.overdue_warning_sent_at:
            transaction.overdue_warning_sent_at = now
            changed = True

        if transaction.listing.status != Listing.Status.LOANED:
            transaction.listing.status = Listing.Status.LOANED
            transaction.listing.save()

        touched_requesters.add(transaction.requester_id)

        if changed:
            transaction.save()

        refreshed.append(transaction)

    if touched_requesters:
        sync_user_overdue_counts(touched_requesters)

    return refreshed


def apply_overdue_suspensions(now=None):
    User = get_user_model()
    now = now or timezone.now()
    warning_cutoff = now - timezone.timedelta(hours=OVERDUE_WARNING_HOURS)

    refresh_overdue_transactions(now=now)

    transactions = Transaction.objects.select_related("requester").filter(
        transaction_type=Transaction.Type.LOAN,
        status=Transaction.Status.OVERDUE,
        actual_return_date__isnull=True,
        overdue_warning_sent_at__isnull=False,
        overdue_warning_sent_at__lte=warning_cutoff,
    )

    suspended_user_ids = set()
    suspension_until = now + timezone.timedelta(days=OVERDUE_SUSPENSION_DAYS)

    for transaction in transactions:
        user = transaction.requester
        if user.is_staff or user.is_superuser:
            continue

        user.is_suspended = True
        user.can_contact = False
        user.suspended_at = user.suspended_at or now
        user.suspension_until = suspension_until
        user.suspension_reason = (
            f"Automatic overdue suspension: '{transaction.listing.title}' was not returned "
            f"within 24 hours of the overdue warning."
        )
        user.save(
            update_fields=[
                "is_suspended",
                "can_contact",
                "suspended_at",
                "suspension_until",
                "suspension_reason",
            ]
        )
        suspended_user_ids.add(user.id)

    if suspended_user_ids:
        sync_user_overdue_counts(suspended_user_ids)

    return User.objects.filter(id__in=suspended_user_ids)


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
            participants = {self.transaction.requester_id, self.transaction.seller_id}
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
