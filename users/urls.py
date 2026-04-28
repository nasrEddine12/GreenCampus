from django.urls import path

from . import admin_views, views

app_name = 'users'

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('verify-email/', views.VerifyEmailView.as_view(), name='verify-email'),
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('logout/', views.LogoutView.as_view(), name='logout'),

    # Admin moderation
    path('admin/users/', admin_views.AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/stats/', admin_views.AdminStatsView.as_view(), name='admin-stats'),
    path('admin/users/<int:user_id>/suspend/', admin_views.AdminSuspendUserView.as_view(), name='admin-suspend'),
    path('admin/users/<int:user_id>/blacklist/', admin_views.AdminBlacklistUserView.as_view(), name='admin-blacklist'),
    path('admin/users/<int:user_id>/reactivate/', admin_views.AdminReactivateUserView.as_view(), name='admin-reactivate'),
]

