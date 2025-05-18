import React from "react";
import { useTranslation } from "react-i18next";
import {
  Config,
  ConfigStatus,
  ProcessingMode,
  ProcessingModeEnum,
} from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  setConfig: (config: Config) => void;
  onSave: () => Promise<void>;
  processingMode: ProcessingMode;
  checkingConfig: boolean;
  configError: string;
  configStatus: ConfigStatus;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  setConfig,
  onSave,
  processingMode,
  checkingConfig,
  configError,
  configStatus,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{t("app.settings")}</h2>
          <button
            className="btn-icon modal-close-btn"
            onClick={onClose}
            disabled={checkingConfig}
            title={t("app.close")}
          >
            &times;
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-description">
            {processingMode === ProcessingModeEnum.GITHUB
              ? t("settings.github.description")
              : t("settings.local.description")}
          </p>
          {processingMode === ProcessingModeEnum.GITHUB && (
            <>
              <div className="form-group">
                <label htmlFor="username">
                  {t("settings.github.username")}
                </label>
                <input
                  id="username"
                  type="text"
                  value={config.username}
                  onChange={(e) =>
                    setConfig({ ...config, username: e.target.value })
                  }
                  disabled={checkingConfig}
                />
              </div>
              <div className="form-group">
                <label htmlFor="repo">{t("settings.github.repo")}</label>
                <input
                  id="repo"
                  type="text"
                  value={config.repo}
                  onChange={(e) =>
                    setConfig({ ...config, repo: e.target.value })
                  }
                  disabled={checkingConfig}
                />
              </div>
              <div className="form-group">
                <label htmlFor="branch">{t("settings.github.branch")}</label>
                <input
                  id="branch"
                  type="text"
                  value={config.branch}
                  onChange={(e) =>
                    setConfig({ ...config, branch: e.target.value })
                  }
                  disabled={checkingConfig}
                />
              </div>
              <div className="form-group">
                <label htmlFor="token">{t("settings.github.token")}</label>
                <input
                  id="token"
                  type="password"
                  value={config.token}
                  onChange={(e) =>
                    setConfig({ ...config, token: e.target.value })
                  }
                  disabled={checkingConfig}
                />
              </div>
            </>
          )}
          <div className="form-group checkbox-group">
            <input
              id="enableCompression"
              type="checkbox"
              checked={config.enableCompression}
              onChange={(e) =>
                setConfig({ ...config, enableCompression: e.target.checked })
              }
              disabled={checkingConfig}
            />
            <label htmlFor="enableCompression">
              {t("settings.compression.label")}-{" "}
              {config.enableCompression && !config.tinifyKey
                ? t("settings.compression.keyRequired")
                : config.enableCompression
                  ? t("settings.compression.enabled")
                  : t("settings.compression.disabled")}
            </label>
          </div>
          {config.enableCompression && (
            <div className="form-group">
              <label htmlFor="tinifyKey">
                {t("settings.compression.apiKey")}
              </label>
              <input
                id="tinifyKey"
                type="password"
                value={config.tinifyKey}
                onChange={(e) =>
                  setConfig({ ...config, tinifyKey: e.target.value })
                }
                disabled={checkingConfig}
              />
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={
              checkingConfig ||
              (processingMode === ProcessingModeEnum.GITHUB &&
                (!config.username || !config.repo || !config.token)) ||
              (config.enableCompression && !config.tinifyKey)
            }
          >
            {checkingConfig
              ? t("settings.saving")
              : processingMode === ProcessingModeEnum.GITHUB
                ? t("settings.github.save")
                : t("settings.compression.save")}
          </button>
          {configError && (
            <div className="alert alert-error">{configError}</div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
