from django.core.management.base import BaseCommand

from marketplace.models import apply_overdue_suspensions, refresh_overdue_transactions


class Command(BaseCommand):
    help = "Refresh overdue loan transactions and apply one-week suspensions after the 24-hour warning period."

    def handle(self, *args, **options):
        overdue_transactions = refresh_overdue_transactions()
        suspended_users = apply_overdue_suspensions()

        self.stdout.write(
            self.style.SUCCESS(
                f"Refreshed {len(overdue_transactions)} overdue transaction(s); "
                f"applied {suspended_users.count()} suspension(s)."
            )
        )
