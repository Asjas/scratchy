<script setup lang="ts">
import { ref, onMounted } from "vue";

interface Release {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string;
  prerelease: boolean;
  html_url: string;
  body: string | null;
}

const releases = ref<Release[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

onMounted(async () => {
  try {
    const res = await fetch("https://api.github.com/repos/Asjas/scratchyjs/releases", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    releases.value = await res.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load releases";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="releases-wrapper">
    <!-- Loading state -->
    <div v-if="loading" class="releases-loading">
      <span class="releases-spinner" aria-hidden="true" />
      Loading releases…
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="releases-error">
      <strong>Error:</strong> {{ error }}.
      <a href="https://github.com/Asjas/scratchyjs/releases" target="_blank" rel="noopener">
        View releases on GitHub →
      </a>
    </div>

    <!-- Empty state -->
    <p v-else-if="releases.length === 0" class="releases-empty">
      No releases found.
      <a href="https://github.com/Asjas/scratchyjs/releases" target="_blank" rel="noopener">
        Check GitHub →
      </a>
    </p>

    <!-- Releases table -->
    <table v-else class="releases-table">
      <thead>
        <tr>
          <th>Version</th>
          <th>Date</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="release in releases" :key="release.id">
          <td>
            <a :href="release.html_url" target="_blank" rel="noopener" class="release-link">
              {{ release.name || release.tag_name }}
            </a>
          </td>
          <td class="release-date">{{ formatDate(release.published_at) }}</td>
          <td>
            <span :class="['release-badge', release.prerelease ? 'badge-pre' : 'badge-stable']">
              {{ release.prerelease ? "Pre-release" : "Stable" }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="releases-footer">
      <a href="https://github.com/Asjas/scratchyjs/releases" target="_blank" rel="noopener">
        View all releases on GitHub →
      </a>
    </p>
  </div>
</template>

<style scoped>
.releases-wrapper {
  margin-top: 1.5rem;
}

/* ── Loading ── */
.releases-loading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--vp-c-text-2);
  padding: 1.5rem 0;
}

.releases-spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Error / Empty ── */
.releases-error,
.releases-empty {
  color: var(--vp-c-text-2);
  padding: 1rem 0;
}

.releases-error a,
.releases-empty a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

/* ── Table ── */
.releases-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.93rem;
}

.releases-table th,
.releases-table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
}

.releases-table th {
  color: var(--vp-c-text-2);
  font-weight: 600;
  background: var(--vp-c-bg-soft);
}

.releases-table tr:last-child td {
  border-bottom: none;
}

.releases-table tr:hover td {
  background: var(--vp-c-bg-soft);
}

/* ── Version link ── */
.release-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.release-link:hover {
  text-decoration: underline;
}

/* ── Date ── */
.release-date {
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

/* ── Badges ── */
.release-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.badge-stable {
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
}

.badge-pre {
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-2);
}

/* ── Footer link ── */
.releases-footer {
  margin-top: 1rem;
  font-size: 0.88rem;
}

.releases-footer a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.releases-footer a:hover {
  text-decoration: underline;
}
</style>
