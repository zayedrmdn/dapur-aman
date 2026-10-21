let
  # nixpkgs = fetchTarball "https://github.com/NixOS/nixpkgs/tarball/nixos-26.05";
  # pkgs = import nixpkgs { };
  pkgs = import <nixpkgs> { };
  PROJECT_ROOT = builtins.toString ./.;
in
with pkgs;
mkShell {

  nativeBuildInputs = [
  ];

  packages = with pkgs; [
	python3
	python313Packages.uv
	python313Packages.setuptools
  ];

  propagateBuildInputs = with python3Packages; [ setuptools ];

  shellHook = "
    .venv/activate
    
  ";
}
