from django.http import JsonResponse


def api_index(request):
    return JsonResponse(
        {
            "status": "ok",
            "message": "GreenCampus backend is running.",
            "endpoints": [
                "/api/users/register/",
                "/api/users/login/",
                "/api/users/verify-email/",
                "/api/users/profile/",
                "/api/market/categories/",
                "/api/market/listings/",
                "/api/users/admin/users/",
                "/api/users/admin/stats/",
            ],
        }
    )

