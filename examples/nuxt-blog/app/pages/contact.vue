<script setup lang="ts">
useHead({ title: 'Contact' })
</script>

<template>
  <section>
    <h1>Contact</h1>
    <!-- A form built in the admin under Forms, with the slug "contact". -->
    <ClientOnly>
      <easy-form form="contact" />
    </ClientOnly>
  </section>
</template>
