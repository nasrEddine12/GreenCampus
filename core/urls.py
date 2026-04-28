from django.contrib import admin
from django.urls import include, path

from .views import api_index

urlpatterns = [
    path("", api_index, name="api-index"),
    path("admin/", admin.site.urls),
    path("api/users/", include("users.urls", namespace="users")),
    path("api/market/", include("marketplace.urls", namespace="marketplace")),
]
