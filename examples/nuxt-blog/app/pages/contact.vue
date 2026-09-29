<script setup lang="ts">
useHead({ title: 'Contact' })
// Thai by default, English at ?locale=en, like the posts.
const route = useRoute()
const locale = computed(() => (route.query.locale === 'en' ? 'en' : 'th'))
</script>

<template>
  <section>
    <h1>Contact</h1>
    <!-- A form built in the admin under Forms, with the slug "contact". -->
    <ClientOnly>
      <easy-form form="contact" :locale="locale" />
    </ClientOnly>
  </section>
</template>
