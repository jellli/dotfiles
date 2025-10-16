-- Task runner.
return {
  {
    "stevearc/overseer.nvim",
    cmd = {
      "OverseerOpen",
      "OverseerClose",
      "OverseerToggle",
      "OverseerSaveBundle",
      "OverseerLoadBundle",
      "OverseerDeleteBundle",
      "OverseerRunCmd",
      "OverseerRun",
      "OverseerInfo",
      "OverseerBuild",
      "OverseerQuickAction",
      "OverseerTaskAction",
      "OverseerClearCache",
    },
    opts = {
      -- Setup DAP later when lazy-loading the plugin.
      dap = false,
      task_list = {
        default_detail = 2,
        direction = "bottom",
        -- max_width = { 600, 0.7 },
        bindings = {
          ["<C-b>"] = "ScrollOutputUp",
          ["<C-f>"] = "ScrollOutputDown",
          ["H"] = "IncreaseAllDetail",
          ["L"] = "DecreaseAllDetail",
          -- Disable mappings I don't use.
          ["g?"] = false,
          ["<C-l>"] = false,
          ["<C-h>"] = false,
          ["{"] = false,
          ["}"] = false,
        },
      },
      form = {
        win_opts = { winblend = 0 },
      },
      confirm = {
        win_opts = { winblend = 0 },
      },
      task_win = {
        win_opts = { winblend = 0 },
      },
    },
    keys = {
      { "<leader>ot", "<cmd>OverseerToggle<cr>", desc = "Task list" },
      {
        "<leader>oo",
        function()
          local overseer = require("overseer")
          overseer.run_template({}, function(task)
            if task then
              overseer.open({ enter = false })
            end
          end)
        end,
        desc = "Run task",
      },
      { "<leader>oq", "<cmd>OverseerQuickAction<cr>", desc = "Action recent task" },
      { "<leader>oi", "<cmd>OverseerInfo<cr>", desc = "Overseer Info" },
      { "<leader>ob", "<cmd>OverseerBuild<cr>", desc = "Task builder" },
      { "<leader>oa", "<cmd>OverseerTaskAction<cr>", desc = "Task action" },
      { "<leader>oc", "<cmd>OverseerClearCache<cr>", desc = "Clear cache" },
    },
  },
}
