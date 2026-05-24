<template>
  <div v-if="isLoading" class="loader-screen">
    <div class="spinner-ring"></div>
    <span class="loading-text">Synchronizing session...</span>
  </div>

  <div v-else-if="!user" class="unauthorized-redirect">
    <!-- Will navigate to /login via onMounted -->
  </div>

  <div v-else class="inbox-container animate-fade-in">
    <!-- Header -->
    <header class="glass-header inbox-header">
      <div class="header-content">
        <div class="header-logo" @click="navigateTo('/')" style="cursor: pointer;">
          <div class="logo-box">
            <svg class="logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6C4 4.34315 7.58172 3 12 3C16.4183 3 20 4.34315 20 6M4 6C4 7.65685 7.58172 9 12 9C16.4183 9 20 7.65685 20 6M4 6V12C4 13.6569 7.58172 15 12 15C16.4183 15 20 13.6569 20 12V6M4 12V18C4 19.6569 7.58172 21 12 21C16.4183 21 20 19.6569 20 18V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="logo-title">SyncQL</span>
        </div>

        <div class="header-user">
          <button class="btn btn-secondary logout-btn" @click="navigateTo('/')">
            Back to Dashboard
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="inbox-main">
      <div class="inbox-box glass-panel">
        <div class="inbox-title-bar">
          <Mail class="inbox-icon" />
          <h1 class="inbox-title">Collaborative Invitations</h1>
        </div>

        <!-- Success/Error Banners -->
        <div v-if="successMsg" class="alert alert-success animate-fade-in">{{ successMsg }}</div>
        <div v-if="errorMsg" class="alert alert-danger animate-fade-in">{{ errorMsg }}</div>

        <div v-if="invitations.length > 0" class="invitations-list">
          <div 
            v-for="inv in invitations" 
            :key="inv.workspace_id" 
            class="invitation-card glass-panel"
          >
            <div class="inv-card-left">
              <img :src="inv.owner_avatar || '/logo.png'" class="inv-owner-avatar" alt="Owner Avatar" />
              <div class="inv-details">
                <p class="inv-text">
                  <strong class="text-primary-glow">{{ inv.owner_name }}</strong> invited you to join workspace <strong class="text-active">{{ inv.workspace_name }}</strong>
                </p>
                <span class="inv-time">Received {{ formatDate(inv.created_at) }}</span>
              </div>
            </div>

            <div class="inv-actions">
              <button 
                class="btn btn-secondary btn-decline" 
                @click="respondInvite(inv.workspace_id, 'decline')"
                :disabled="responding"
              >
                Decline
              </button>
              <button 
                class="btn btn-primary btn-accept" 
                @click="respondInvite(inv.workspace_id, 'accept')"
                :disabled="responding"
              >
                Accept Join
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-inbox">
          <div class="empty-icon-box">
            <MailOpen class="empty-icon" />
          </div>
          <h3>Your inbox is empty</h3>
          <p>When someone invites you to their workspace, the pending invitations will show up right here.</p>
          <button class="btn btn-primary" @click="navigateTo('/')" style="margin-top: 1rem;">
            Go to Dashboard
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '~/composables/useAuth';
import { Mail, MailOpen } from 'lucide-vue-next';

const { user, isLoading, fetchUser } = useAuth();
const invitations = ref([]);
const responding = ref(false);
const successMsg = ref('');
const errorMsg = ref('');

onMounted(async () => {
  await fetchUser();
  if (!user.value) {
    navigateTo('/login');
  } else {
    await loadInvitations();
  }
});

const loadInvitations = async () => {
  try {
    const data = await $fetch('/api/workspaces/invitations');
    invitations.value = data.invitations || [];
  } catch (e) {
    console.error('Failed to load invitations:', e);
  }
};

const respondInvite = async (workspaceId, action) => {
  responding.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    const res = await $fetch('/api/workspaces/respond', {
      method: 'POST',
      body: {
        workspaceId,
        action
      }
    });
    if (res.success) {
      successMsg.value = res.message;
      // Re-fetch list
      await loadInvitations();
      // Auto redirect to dashboard after 1.5 seconds if they accepted
      if (action === 'accept') {
        setTimeout(() => {
          navigateTo('/');
        }, 1500);
      }
    }
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Failed to process invitation';
  } finally {
    responding.value = false;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<style scoped>
.loader-screen {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: hsl(var(--background));
  gap: 1.25rem;
}

.spinner-ring {
  width: 48px;
  height: 48px;
  border: 4px solid hsl(var(--border));
  border-top-color: hsl(var(--primary));
  border-radius: 50%;
  animation: spin 1s infinite linear;
}

.loading-text {
  font-size: 0.9rem;
  color: hsl(var(--muted-foreground));
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.glass-header {
  height: 68px;
  backdrop-filter: blur(12px);
  background-color: hsl(var(--background) / 0.8);
  border-bottom: 1px solid hsl(var(--border) / 0.4);
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo-box {
  width: 36px;
  height: 36px;
  background-color: hsl(var(--primary) / 0.15);
  border: 1px solid hsl(var(--primary) / 0.3);
  color: hsl(var(--primary));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-svg {
  width: 20px;
  height: 20px;
  color: hsl(var(--primary));
}

.logo-title {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.header-user {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.inbox-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}

.inbox-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.inbox-main {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 3rem 2rem;
}

.inbox-box {
  width: 100%;
  max-width: 800px;
  padding: 2.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.inbox-title-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 1rem;
}

.inbox-icon {
  width: 24px;
  height: 24px;
  color: hsl(var(--primary));
}

.inbox-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.invitations-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.invitation-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  gap: 1.5rem;
}

.inv-card-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.inv-owner-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid hsl(var(--primary) / 0.3);
}

.inv-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.inv-text {
  font-size: 0.9rem;
  line-height: 1.4;
}

.text-active {
  color: hsl(var(--primary));
}

.inv-time {
  font-size: 0.725rem;
  color: hsl(var(--muted-foreground));
}

.inv-actions {
  display: flex;
  gap: 0.75rem;
  flex-shrink: 0;
}

.btn-decline {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.btn-decline:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-accept {
  background: linear-gradient(135deg, hsl(var(--primary)), #06b6d4);
  color: #fff;
  border: none;
}

.btn-accept:hover {
  opacity: 0.9;
}

.empty-inbox {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 1rem;
  gap: 0.5rem;
}

.empty-icon-box {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.empty-icon {
  width: 28px;
  height: 28px;
  color: hsl(var(--muted-foreground));
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.775rem;
  font-weight: 500;
  margin-bottom: 1.25rem;
}

.alert-danger {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.alert-success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: #34d399;
}
</style>
