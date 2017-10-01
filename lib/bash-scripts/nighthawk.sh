#!/bin/bash

LINE_TO_ADD=". $HOME/.nighthawk/nighthawk.sh"
BASHRC_PATH="$HOME/.bashrc"
BASH_PROFILE_PATH=$HOME/.bash_profile
PROFILE_PATH=$HOME/.profile

trap clean_up EXIT

clean_up() {
  echo "Exiting Nighthawk session"
  echo "Start a new session manually by entering nighthawk"
  printf "\033]0;\007"
}

install_script() {
  touch $BASHRC_PATH
  if ! grep -q ".nighthawk/nighthawk.sh" $BASHRC_PATH
  then
    printf "%s\n" "$LINE_TO_ADD" >> $BASHRC_PATH
  fi
}

ask_to_start_tracking()
{
  read -p $'\nStart a new 🐦  Nighthawk session?\nEnter y or n:\n' -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]
  then
    addMetadata() {
      if [[ -z $SCRIPT ]]
      then
        clear
        echo 'Nighthawk is now running!'
        echo "You can always tell by the 🐦  emoji to the left of your prompt or tab."
        echo "To exit a session simply enter exit."
        echo "Start a new session manually by entering nighthawk."
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
    # export ORIG_PROMPT_COMMAND
    [[ $OSTYPE == *"linux"* ]] && f=f || f=F
    env PS1="$PS1" script -a -q -$f >(addMetadata)
  else
    echo "You can always start a Nighthawk session manually by entering nighthawk"
  fi
}
# if script is not last line then move it to bottom and return
install_script

if [[ ! -z $SCRIPT || $(ps -fp "$PPID" | grep "script -a -q -" || ps -fp "$PPID" | grep "bash -i") ]]
then
  # if we get here then we are already in a "script" session
  if [ "$NIGHTHAWK" != true ]
  then
    # after starting new session reload configs & flip flag to prevent recursive inception
    export NIGHTHAWK=true
    # echo 'reloading profiles'
    [ -s "$BASH_PROFILE_PATH" ] && . "$BASH_PROFILE_PATH"
    [ -s "$BASHRC_PATH" ] && . "$BASHRC_PATH"
    [ -s "$PROFILE_PATH" ] && . "$BASHRC_PATH"
    PS1="🐦 $PS1"
    if [[ $OSTYPE == *"darwin"* ]]
    then
      PROMPT_COMMAND=$'printf "\e]1;%s\a" "🐦 - /${PWD##*/}"'
    else
      PROMPT_COMMAND=$'printf "\033]0;🐦 - /${PWD##*/}\007"'
    fi

  else
    # echo 'already in nh script! not loading profile'
    return
  fi

  return

  else
    # make sure this is a interactive session
    test "$PS1" && ask_to_start_tracking
fi
