import { ref } from 'vue';

const user = ref<any>(null);
const isLoading = ref(true);

export function useAuth() {
  const fetchUser = async () => {
    isLoading.value = true;
    try {
      const data = await $fetch<{ user: any }>('/api/auth/session');
      user.value = data.user;
    } catch (e) {
      console.error('Failed to load user session:', e);
      user.value = null;
    } finally {
      isLoading.value = false;
    }
  };

  const loginWithDemo = async (username: string, avatar: string) => {
    isLoading.value = true;
    try {
      const res = await $fetch<{ success: boolean; user: any }>('/api/auth/demo', {
        method: 'POST',
        body: { username, avatar }
      });
      if (res.success) {
        user.value = res.user;
        return true;
      }
      return false;
    } catch (e) {
      console.error('Demo login error:', e);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const logout = async () => {
    isLoading.value = true;
    try {
      const res = await $fetch<{ success: boolean }>('/api/auth/logout', {
        method: 'POST'
      });
      if (res.success) {
        user.value = null;
        navigateTo('/login');
      }
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      isLoading.value = false;
    }
  };

  return {
    user,
    isLoading,
    fetchUser,
    loginWithDemo,
    logout
  };
}
