<template>
  <div class="min-h-screen flex items-center justify-center bg-primary">

    <!-- Card -->
    <div class="w-full max-w-md bg-surface-card rounded-2xl shadow-xl p-10">

      <!-- Logo / Titel -->
      <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-primary">SIX7</h1>
        <p class="text-content-secondary mt-2">
          Click'n Deploy
        </p>
      </div>

      <!-- Seiteninhalt -->
      <slot />

    </div>
  </div>
</template>
