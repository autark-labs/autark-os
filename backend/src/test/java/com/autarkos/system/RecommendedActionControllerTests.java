package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class RecommendedActionControllerTests {

    @Test
    void returnsCurrentAction() {
        RecordingProvider provider = new RecordingProvider();
        RecommendedActionController controller = new RecommendedActionController(provider);

        RecommendedAction action = controller.current();
        assertThat(action.id()).isEqualTo("first-backup");
    }

    private static class RecordingProvider implements RecommendedActionProvider {
        @Override
        public RecommendedAction current() {
            return new RecommendedAction("first-backup", "warning", "Create your first restore point", "Back up before changes.", Optional.empty(), Optional.empty(), List.of("first-backup"));
        }
    }
}
