from datetime import date

from django.db.models import F
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Transaction


@receiver(post_save, sender=Transaction)
def auto_suspend_overdue_loans(sender, instance, **kwargs):
    """Suspend borrowers with overdue loans until the item is returned or cancelled."""
    if instance.transaction_type != Transaction.Type.LOAN:
        return

    if instance.loan_end is None:
        return

    if instance.status in {Transaction.Status.DONE, Transaction.Status.CANCELLED}:
        return

    if instance.loan_end >= date.today():
        return

    borrower = instance.borrower
    if borrower.is_suspended and borrower.suspension_reason == "Overdue loan: item not returned.":
        return

    borrower.is_suspended = True
    borrower.suspension_reason = "Overdue loan: item not returned."
    borrower.overdue_count = F("overdue_count") + 1
    borrower.save(update_fields=["is_suspended", "suspension_reason", "overdue_count"])

