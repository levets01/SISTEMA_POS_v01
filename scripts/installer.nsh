!macro customInit
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R0 != ""
    ReadEnvStr $R1 "PUESTO_VERIFIED_UPDATE"
    ${If} $R1 != "${VERSION}"
      MessageBox MB_ICONSTOP|MB_OK "Para actualizar, abra Configuración > Actualizaciones en Puesto POS. El sistema debe verificar el respaldo y el instalador." /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend
