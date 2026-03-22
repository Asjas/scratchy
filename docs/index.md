<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vitepress";

const router = useRouter();

onMounted(() => {
  router.go("/getting-started");
});
</script>
