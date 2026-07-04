package com.autarkos.marketplace.install;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.SetupField;
import com.autarkos.marketplace.model.SetupManifest;
import com.autarkos.marketplace.model.UsageField;
import com.autarkos.marketplace.model.UsageManifest;

@Component
public class PostInstallGuideBuilder {

    public GuideModels.PostInstallGuide build(ApplicationManifest manifest, String accessUrl, GuideModels.PostInstallProvisioningResult provisioningResult) {
        return build(manifest, accessUrl, null, provisioningResult);
    }

    public GuideModels.PostInstallGuide build(ApplicationManifest manifest, String accessUrl, String privateAccessUrl, GuideModels.PostInstallProvisioningResult provisioningResult) {
        UsageManifest usage = manifest.usage();
        Map<String, String> values = values(manifest, accessUrl, privateAccessUrl, provisioningResult);

        List<GuideModels.PostInstallValue> fields = usage.fields().stream()
                .map(field -> value(field, values))
                .toList();

        return new GuideModels.PostInstallGuide(
                usage.kind(),
                usage.primaryAction(),
                usage.openUrlLabel(),
                resolve(usage.headline(), values),
                resolve(usage.summary(), values),
                usage.setupSteps().stream().map(step -> resolve(step, values)).toList(),
                fields,
                usage.notes().stream().map(note -> resolve(note, values)).toList());
    }

    public GuideModels.AppSetupGuide buildSetupGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl, GuideModels.PostInstallProvisioningResult provisioningResult, Set<String> installedAppIds) {
        SetupManifest setup = manifest.setup();
        Map<String, String> values = values(manifest, accessUrl, privateAccessUrl, provisioningResult);
        return new GuideModels.AppSetupGuide(
                setup.kind(),
                setup.automation(),
                setup.generatedValues().stream()
                        .map(field -> new GuideModels.AppSetupField(field.label(), resolve(field.value(), values), field.sensitive(), false, field.recoverable()))
                        .toList(),
                setup.copyableFields().stream()
                        .map(field -> setupField(field, values, false))
                        .toList(),
                setup.qrFields().stream()
                        .map(field -> setupField(field, values, true))
                        .toList(),
                setup.integrations().stream()
                        .map(integration -> new GuideModels.AppSetupIntegration(
                                integration.id(),
                                integration.name(),
                                integration.targetAppId(),
                                integration.targetAppId() == null || integration.targetAppId().isBlank()
                                        ? "available"
                                        : installedAppIds.contains(integration.targetAppId()) ? "ready" : "missing",
                                resolve(integration.description(), values),
                                integration.requiresApproval(),
                                integration.plannedActions().stream().map(action -> resolve(action, values)).toList()))
                        .toList(),
                setup.userSteps().stream().map(step -> resolve(step, values)).toList(),
                setup.automationCapabilities().stream().map(capability -> resolve(capability, values)).toList());
    }

    private Map<String, String> values(ApplicationManifest manifest, String accessUrl, String privateAccessUrl, GuideModels.PostInstallProvisioningResult provisioningResult) {
        Map<String, String> values = new HashMap<>(provisioningResult.values());
        values.put("accessUrl", accessUrl == null ? "" : accessUrl);
        values.put("privateAccessUrl", privateAccessUrl == null ? "" : privateAccessUrl);
        values.put("localAccessUrl", accessUrl == null ? "" : accessUrl);
        values.put("appName", manifest.name());
        return values;
    }

    private GuideModels.PostInstallValue value(UsageField field, Map<String, String> values) {
        return new GuideModels.PostInstallValue(
                field.label(),
                resolve(field.value(), values),
                field.sensitive(),
                field.qr());
    }

    private GuideModels.AppSetupField setupField(SetupField field, Map<String, String> values, boolean qr) {
        return new GuideModels.AppSetupField(
                field.label(),
                resolve(field.value(), values),
                field.sensitive(),
                qr,
                true);
    }

    private String resolve(String template, Map<String, String> values) {
        String resolved = template == null ? "" : template;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            resolved = resolved.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return resolved;
    }
}
