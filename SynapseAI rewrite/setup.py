#!/usr/bin/env python3
"""
SynapseAI Executor Setup Script
Install with: pip install -e .
Or: python setup.py install
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="synapseai-executor",
    version="1.0.0",
    author="SynapseAI",
    description="A modern, cross-platform Roblox script executor",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/nflgamergod-art/SynapseAI-bot1",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    install_requires=[
        "flask>=2.3.0",
        "flask-cors>=4.0.0",
        "psutil>=5.9.0",
        # Optional but used for native macOS window launcher
        "pywebview>=4.4",
    ],
    entry_points={
        "console_scripts": [
            "synapse=main:main",
            "synapse-app=mac_app:main",
        ],
    },
    include_package_data=True,
    package_data={
        "": ["templates/*.html", "static/*.css", "static/*.js", "scripts/*.lua", "scripts/*.json"],
    },
)
