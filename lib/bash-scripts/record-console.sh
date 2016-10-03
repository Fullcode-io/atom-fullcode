#!/bin/bash

read -p "Record Session? Type 'y' or 'n'" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  # save prompt here to reference later in sub-process via bashrc
  export ORIGPS1=$PS1

  addate() {
    while IFS= read -r line; do
      printf "%s %s\n" "$(date)" "$line"
    done>> $HOME/tmp/sessions/studentLogger.log
  }
  echo "Logging Terminal Session"
  script -a -q -t 0 >(addate)
fi
