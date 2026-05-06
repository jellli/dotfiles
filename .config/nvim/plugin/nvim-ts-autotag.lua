require("pack").add({
	{
		src = "https://github.com/windwp/nvim-ts-autotag",
		after = function()
			require("nvim-ts-autotag").setup({
				opts = {
					enable_close = true,
					enable_rename = true,
					enable_close_on_slash = true,
				},
			})
		end,
	},
})
