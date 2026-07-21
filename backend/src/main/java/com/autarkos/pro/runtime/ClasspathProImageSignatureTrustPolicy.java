package com.autarkos.pro.runtime;

import java.io.InputStream;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.module.ProModuleException;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class ClasspathProImageSignatureTrustPolicy
        implements ProImageSignatureTrustPolicy {

    static final String RESOURCE =
            "/pro/image-signature-trust-policy-v1.json";
    private static final Set<String> EXPECTED_CHANNELS =
            Set.of("development", "staging", "beta", "stable");
    private static final String VERSION_PATTERN =
            "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\."
                    + "(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?"
                    + "(?:\\+[0-9A-Za-z.-]+)?$";

    private final Policy policy;

    public ClasspathProImageSignatureTrustPolicy() {
        this(RESOURCE);
    }

    ClasspathProImageSignatureTrustPolicy(String resource) {
        this.policy = load(resource);
    }

    public List<String> verificationArguments(
            ProReleaseManifest manifest) {
        if (manifest == null
                || manifest.version() == null
                || !manifest.version().matches(VERSION_PATTERN)
                || manifest.releaseChannel() == null
                || !policy.channels().contains(
                        manifest.releaseChannel())
                || manifest.component() == null
                || !"autark-pro-agent".equals(
                        manifest.component())) {
            throw invalidPolicy("module_image_signature_policy_invalid");
        }
        String ref = "refs/tags/v" + manifest.version();
        String identity = "https://github.com/"
                + policy.repository()
                + "/"
                + policy.workflow()
                + "@"
                + ref;
        return List.of(
                "--certificate-identity",
                identity,
                "--certificate-oidc-issuer",
                policy.issuer(),
                "--certificate-github-workflow-repository",
                policy.repository(),
                "--certificate-github-workflow-ref",
                ref,
                "--certificate-github-workflow-trigger",
                policy.trigger(),
                "--annotations",
                "autark.component=" + manifest.component(),
                "--annotations",
                "autark.version=" + manifest.version(),
                "--annotations",
                "autark.release-channel="
                        + manifest.releaseChannel(),
                "--annotations",
                "autark.subject=index");
    }

    private static Policy load(String resource) {
        ObjectMapper mapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(
                                StreamReadFeature
                                        .STRICT_DUPLICATE_DETECTION)
                        .build())
                .enable(
                        DeserializationFeature
                                .FAIL_ON_UNKNOWN_PROPERTIES);
        try (InputStream input =
                ClasspathProImageSignatureTrustPolicy.class
                        .getResourceAsStream(resource)) {
            if (input == null) {
                throw invalidPolicy(
                        "module_image_signature_policy_missing");
            }
            Policy policy = mapper.readValue(input, Policy.class);
            if (!"1".equals(policy.schemaVersion())
                    || policy.issuer() == null
                    || !"https://token.actions.githubusercontent.com"
                            .equals(policy.issuer())
                    || policy.repository() == null
                    || !policy.repository().matches(
                            "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
                    || policy.workflow() == null
                    || !policy.workflow().matches(
                            "^\\.github/workflows/"
                                    + "[A-Za-z0-9_.-]+\\.ya?ml$")
                    || !"push".equals(policy.trigger())
                    || policy.channels() == null
                    || !Set.copyOf(policy.channels())
                            .equals(EXPECTED_CHANNELS)
                    || policy.channels().size()
                            != EXPECTED_CHANNELS.size()) {
                throw invalidPolicy(
                        "module_image_signature_policy_invalid");
            }
            return policy;
        } catch (ProModuleException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidPolicy(
                    "module_image_signature_policy_invalid");
        }
    }

    private static ProModuleException invalidPolicy(String code) {
        return new ProModuleException(
                code,
                "Autark Pro image signature trust policy is invalid.");
    }

    private record Policy(
            String schemaVersion,
            String issuer,
            String repository,
            String workflow,
            String trigger,
            List<String> channels) {
    }
}
