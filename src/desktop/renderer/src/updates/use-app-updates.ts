import { onBeforeUnmount, onMounted, watch } from "vue";

import { useUpdates } from "./use-updates";

/**
 * Wires the update composable into the app lifecycle: mounts the state
 * subscription, triggers one silent check once the user is authenticated,
 * and cleans up on unmount.
 */
export function useAppUpdates(authenticated: () => unknown) {
  const {
    state,
    checking,
    upToDateFlash,
    mount,
    checkSilently,
    checkManually,
    install,
  } = useUpdates();
  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    void mount().then((detach) => {
      unsubscribe = detach;
    });
  });
  onBeforeUnmount(() => unsubscribe?.());

  watch(authenticated, (user) => {
    if (user) checkSilently();
  });

  return {
    updateState: state,
    updateChecking: checking,
    updateUpToDate: upToDateFlash,
    checkUpdate: checkManually,
    installUpdate: install,
  };
}
