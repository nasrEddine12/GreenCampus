from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsListingOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_staff or obj.seller_id == request.user.id


class IsTransactionParticipant(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.user.is_authenticated and request.user.id in {obj.borrower_id, obj.lender_id}


class IsContactParticipant(BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return request.user.is_staff or request.user.id in {obj.sender_id, obj.recipient_id}
