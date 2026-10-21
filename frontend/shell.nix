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
    nodejs_24
  ];

  propagateBuildInputs = with python3Packages; [ setuptools ];

  shellHook = "
    
  ";
}
