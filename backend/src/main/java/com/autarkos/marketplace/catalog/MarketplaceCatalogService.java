package com.autarkos.marketplace.catalog;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.model.ApplicationManifest;

@Service
public class MarketplaceCatalogService {

    private static final String MANIFEST_PATTERN = "classpath:/catalog/apps/*/manifest.yaml";

    private final ManifestYamlReader manifestYamlReader;
    private final ManifestValidator validator;

    public MarketplaceCatalogService(ManifestYamlReader manifestYamlReader, ManifestValidator validator) {
        this.manifestYamlReader = manifestYamlReader;
        this.validator = validator;
    }

    public List<ApplicationManifest> findAll() {
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver().getResources(MANIFEST_PATTERN);
            List<ApplicationManifest> manifests = Arrays.stream(resources)
                    .map(this::readAndValidate)
                    .sorted(Comparator.comparing(ApplicationManifest::name))
                    .toList();
            validator.validateCatalog(manifests);
            validateCatalogAssets(manifests);
            return manifests;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load marketplace catalog.", exception);
        }
    }

    public Optional<ApplicationManifest> findById(String id) {
        return findAll().stream()
                .filter(manifest -> manifest.id().equals(id))
                .findFirst();
    }

    private ApplicationManifest readAndValidate(Resource resource) {
        ApplicationManifest manifest = manifestYamlReader.read(resource);
        validator.validate(manifest);
        return manifest;
    }

    private void validateCatalogAssets(List<ApplicationManifest> manifests) {
        List<String> errors = new ArrayList<>();
        for (ApplicationManifest manifest : manifests) {
            String expectedIcon = "/app-images/" + manifest.id() + ".svg";
            if (!expectedIcon.equals(manifest.image())) {
                errors.add(manifest.id() + " must use its deliberate catalog icon " + expectedIcon);
            } else if (!new ClassPathResource("static" + manifest.image()).exists()) {
                errors.add(manifest.id() + " is missing catalog icon " + manifest.image());
            }
            if (!new ClassPathResource("catalog/apps/" + manifest.id() + "/compose.yaml").exists()) {
                errors.add(manifest.id() + " is missing catalog compose.yaml");
            }
        }
        if (!errors.isEmpty()) {
            throw new ManifestValidationException("catalog", errors);
        }
    }
}
