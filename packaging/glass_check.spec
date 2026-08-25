# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Kontrola skla macOS app.

Build (on macOS):  pyinstaller --noconfirm packaging/glass_check.spec
Produces:          dist/Kontrola skla.app
"""
import os

# SPECPATH is injected by PyInstaller; resolve paths relative to the repo root
# so the build works regardless of the current working directory.
ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))

a = Analysis(
    [os.path.join(ROOT, "glass_check.py")],
    pathex=[ROOT],
    binaries=[],
    # The window is HTML: without web/ inside the bundle the app opens blank.
    datas=[(os.path.join(ROOT, "web"), "web")],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # pywebview probes several GUI toolkits on import; on macOS it uses the
    # system WebKit, so none of these belong in the bundle.
    excludes=["PyQt5", "PyQt6", "PySide2", "PySide6", "qtpy", "gi",
              "cefpython3", "tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="KontrolaSkla",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,            # windowed GUI app, no terminal
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,         # build for the host arch (set by the CI matrix)
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="KontrolaSkla",
)
app = BUNDLE(
    coll,
    name="Kontrola skla.app",
    icon=None,
    bundle_identifier="cz.vltavaholding.kontrolaskla",
    info_plist={
        "CFBundleName": "Kontrola skla",
        "CFBundleDisplayName": "Kontrola skla",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "11.0",
    },
)
