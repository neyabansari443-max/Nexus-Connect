!macro customInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\icons\icon.ico" 0
!macroend
