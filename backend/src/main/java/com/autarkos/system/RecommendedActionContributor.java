package com.autarkos.system;

import java.util.Optional;

public interface RecommendedActionContributor {

    Optional<RecommendedActionContribution> current();
}
