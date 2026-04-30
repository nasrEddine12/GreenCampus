from django.contrib import admin

from .models import Category, ContactMessage, Favorite, Listing, Report, Review, Transaction


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "eco_focus", "created_at"]
    search_fields = ["name", "slug"]
    list_filter = ["eco_focus"]


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ["title", "seller", "category", "price", "eco_score", "is_available"]
    list_filter = ["is_available", "condition", "category"]
    search_fields = ["title", "description", "seller__email"]


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ["user", "listing", "created_at"]
    search_fields = ["user__email", "listing__title"]


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ["listing", "sender", "recipient", "status", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["listing__title", "sender__email", "recipient__email", "message", "reply"]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = [
        "listing",
        "transaction_type",
        "status",
        "borrower",
        "lender",
        "amount",
        "loan_end",
    ]
    list_filter = ["transaction_type", "status"]
    search_fields = ["listing__title", "borrower__email", "lender__email"]


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["transaction", "reviewer", "reviewed_user", "rating", "created_at"]
    search_fields = ["transaction__listing__title", "reviewer__email", "reviewed_user__email"]


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["reporter", "listing", "reported_user", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["reporter__email", "reported_user__email", "reason"]
