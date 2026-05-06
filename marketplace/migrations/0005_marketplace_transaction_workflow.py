from datetime import date

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def migrate_existing_transactions(apps, schema_editor):
    Listing = apps.get_model("marketplace", "Listing")
    Transaction = apps.get_model("marketplace", "Transaction")
    User = apps.get_model("users", "User")

    today = date.today()

    for transaction in Transaction.objects.select_related("listing").all():
        if transaction.transaction_type == "loan" and transaction.expected_return_date:
            transaction.listing.listing_type = "loan"

        if transaction.status == "done":
            if transaction.transaction_type == "loan":
                transaction.status = "returned"
                transaction.actual_return_date = transaction.expected_return_date or today
            else:
                transaction.status = "sold"
        elif (
            transaction.transaction_type == "loan"
            and transaction.status == "accepted"
            and transaction.expected_return_date
        ):
            if transaction.expected_return_date < today:
                transaction.status = "overdue"
                transaction.was_ever_overdue = True
            else:
                transaction.status = "active_loan"

        transaction.save()

    for listing in Listing.objects.all():
        transactions = Transaction.objects.filter(listing=listing)
        if transactions.filter(transaction_type="loan").exists():
            listing.listing_type = "loan"
        else:
            listing.listing_type = "sale"

        if transactions.filter(status__in=["active_loan", "overdue"]).exists():
            listing.status = "loaned"
            listing.is_available = False
        elif transactions.filter(status="sold").exists():
            listing.status = "sold"
            listing.is_available = False
        elif transactions.filter(status__in=["accepted", "meeting_scheduled", "handed_over"]).exists():
            listing.status = "reserved"
            listing.is_available = False
        elif listing.status not in {"hidden", "sold"}:
            listing.status = "available"
            listing.is_available = True

        listing.save()

    overdue_totals = {}
    for row in Transaction.objects.filter(was_ever_overdue=True).values_list("requester_id"):
        requester_id = row[0]
        overdue_totals[requester_id] = overdue_totals.get(requester_id, 0) + 1

    for user in User.objects.all():
        user.overdue_count = overdue_totals.get(user.id, 0)
        user.save(update_fields=["overdue_count"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_user_can_contact"),
        ("marketplace", "0004_listing_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="listing",
            name="listing_type",
            field=models.CharField(
                choices=[
                    ("sale", "Sell"),
                    ("loan", "Loan / Rent"),
                    ("exchange", "Exchange"),
                    ("donate", "Donate"),
                ],
                default="sale",
                max_length=12,
            ),
        ),
        migrations.RenameField(
            model_name="transaction",
            old_name="borrower",
            new_name="requester",
        ),
        migrations.RenameField(
            model_name="transaction",
            old_name="lender",
            new_name="seller",
        ),
        migrations.RenameField(
            model_name="transaction",
            old_name="amount",
            new_name="price",
        ),
        migrations.RenameField(
            model_name="transaction",
            old_name="loan_start",
            new_name="requested_start_date",
        ),
        migrations.RenameField(
            model_name="transaction",
            old_name="loan_end",
            new_name="expected_return_date",
        ),
        migrations.AddField(
            model_name="transaction",
            name="actual_return_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="buyer_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="meeting_datetime",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="meeting_location",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="transaction",
            name="meeting_status",
            field=models.CharField(
                choices=[
                    ("proposed", "Proposed"),
                    ("accepted", "Accepted"),
                    ("rejected", "Rejected"),
                    ("rescheduled", "Rescheduled"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="proposed",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="transaction",
            name="message",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="resolution_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="resolved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="resolved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="resolved_transactions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="transaction",
            name="seller_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="was_ever_overdue",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="listing",
            name="status",
            field=models.CharField(
                choices=[
                    ("available", "Available"),
                    ("reserved", "Reserved"),
                    ("sold", "Sold"),
                    ("loaned", "Loaned"),
                    ("exchanged", "Exchanged"),
                    ("donated", "Donated"),
                    ("hidden", "Hidden"),
                ],
                default="available",
                max_length=12,
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="expected_return_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="price",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=10,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="requester",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="requested_transactions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="requested_start_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="seller",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="seller_transactions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("accepted", "Accepted"),
                    ("rejected", "Rejected"),
                    ("cancelled", "Cancelled"),
                    ("meeting_scheduled", "Meeting Scheduled"),
                    ("handed_over", "Item Handed Over"),
                    ("active_loan", "Active Loan"),
                    ("completed", "Completed"),
                    ("sold", "Sold"),
                    ("returned", "Returned"),
                    ("overdue", "Overdue"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="transaction_type",
            field=models.CharField(
                choices=[
                    ("sale", "Sale"),
                    ("loan", "Loan / Rent"),
                    ("exchange", "Exchange"),
                    ("donate", "Donate"),
                ],
                max_length=12,
            ),
        ),
        migrations.RunPython(migrate_existing_transactions, migrations.RunPython.noop),
    ]
