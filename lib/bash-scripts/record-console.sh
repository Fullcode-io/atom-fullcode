#!/bin/bash

LINE_TO_ADD="source ~/.nighthawk/record-console.sh"
BASHRC_PATH=$HOME/.bashrc
BASH_PROFILE_PATH=$HOME/.bash_profile

check_if_last_line()
{
  touch "$1"
  # check if this script is at bottom of profile
  tail -n 1 "$1" | grep -qsFx "$LINE_TO_ADD"
}

move_line_to_bottom()
{
    ex +g/record-console.sh/d -cwq "$1"
    printf "%s\n" "$LINE_TO_ADD" >> "$1"
    # if script line was moved to bottom then exit script since it will be called again later
    return
}

install_script() {
  check_if_last_line $1 || move_line_to_bottom $1
}

ask_to_start_tracking()
{
  read -p "Track Errors? Type 'y' or 'n'" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]
  then
    addMetadata() {
      if [[ -z $SCRIPT ]]
        then
          echo 'Nighthawk running'
      fi

      while IFS= read -r line; do
          PARENTPID=$(pgrep -P "$$" "script" | awk '{system("echo " $1)}')
          if [[ -z $PARENTPID ]]; then return 0; fi
          # # linux ssh shells have an extra process layer
          # pgrep -P "$PARENTPID" "script" && PARENTPID=$(pgrep -P "$PARENTPID" "script" | awk '{system("echo " $1)}')
          CHILDPID=$(pgrep -P "$PARENTPID" "bash" | awk '{system("echo " $1)}')
          if [[ -z $CHILDPID ]]; then return 0; fi
          # # TODO: pwdx solution for linux
          CWD=$(lsof -p "$CHILDPID" | grep "cwd" | awk '{system("echo " $9)}')
          printf "%s\n" "$CWD/ |//🐦//| $(date +%s) |//🐦//| $line"

      done >> $HOME/.nighthawk/logs/session.log
    }
    # linux requires lowercase -f here
    [[ $OSTYPE == *"linux"* ]] && f=f || f=F
    env PS1="$PS1" script -a -q -$f >(addMetadata)
  fi
}
# if script is not last line then move it to bottom and return
install_script $BASHRC_PATH

if [[ $1 = "no-track" ]]
  then
    echo 'exiting'
elif [[ ! -z $SCRIPT || $(ps -fp "$PPID" | grep "script -a -q -" || ps -fp "$PPID" | grep "bash -i") ]]
    then
      # if we get here then we are in the new typescript session
      # remove source to this script then reload bash_profile to set everything back to "normal"
      if [ "$NIGHTHAWK" != true ]
        then
          export NIGHTHAWK=true
          echo 'reloading profile'
          [ -s "$BASH_PROFILE_PATH" ] && source "$BASH_PROFILE_PATH"
          PS1="🐦 $PS1"
      else
        echo 'already in nh script! not loading profile'
      fi
      return
  else
    ask_to_start_tracking
fi
